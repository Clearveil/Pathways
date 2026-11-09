// ---------------------------------------------------------------------------
// Storage boundary, Supabase edition.
//
// Same three functions as the localStorage version, same signatures:
//   load()          -> the whole data object for the signed-in user
//   saveAll(data)   -> persist the whole data object
//   pref(key, val)  -> device-local preferences (theme), still localStorage
//
// The app still thinks in one big object { entries, foods, interventions,
// meals, workouts }. This file translates each collection to and from a
// normalized table, and on save only sends rows that actually changed since
// the last sync, plus deletes for rows that disappeared. That keeps every
// click cheap and every data point a real row you can query.
// ---------------------------------------------------------------------------
import { supabase, LOCAL_ONLY } from "./supabase.js";
import { localStore } from "./store.local.js";
import { KEY, EMPTY, migrate } from "./utils.js";
import { doseLabel } from "./dose.js";

// The app uses "" for "nothing here"; Postgres wants null. Convert at the edge.
const nul = (v) => (v === "" || v === undefined ? null : v);
const str = (v) => (v == null ? "" : v);
const stamp = (v) => (v ? new Date(v).toISOString() : new Date().toISOString());

// One entry per collection: which table it lives in, and how to map a row
// each way. Column names are snake_case in the database, camelCase in the app.
const TABLES = {
  entries: {
    table: "entries", order: "date",
    toRow: (e) => ({
      id: e.id, date: e.date,
      energy: e.energy ?? null, inflammation: e.inflammation ?? null, clarity: e.clarity ?? null, stress: e.stress ?? null,
      flare: !!e.flare, severity: e.severity ?? null,
      activity: nul(e.activity), activity_auto: !!e.activityAuto, activity_note: nul(e.activityNote), notes: nul(e.notes),
      taken: e.taken || [], doses: e.doses || {}, meals_done: e.meals || [], wo_status: e.woStatus || {},
      extras: e.extras || [], extra_workouts: e.extraWorkouts || [], drinks: e.drinks || [], activity_status: e.activityStatus || {}, routine_extras: e.routineExtras || [],
      updated_at: stamp(e.updatedAt),
    }),
    fromRow: (r) => ({
      id: r.id, date: r.date,
      energy: r.energy, inflammation: r.inflammation, clarity: r.clarity, stress: r.stress, flare: r.flare, severity: r.severity,
      activity: str(r.activity), activityAuto: !!r.activity_auto, activityNote: str(r.activity_note), notes: str(r.notes),
      taken: r.taken || [], doses: r.doses || {}, meals: r.meals_done || [], woStatus: r.wo_status || {},
      extras: r.extras || [], extraWorkouts: r.extra_workouts || [], drinks: r.drinks || [], activityStatus: r.activity_status || {}, routineExtras: r.routine_extras || [],
      updatedAt: stamp(r.updated_at),
    }),
  },
  foods: {
    table: "foods", order: "name",
    toRow: (f) => ({ id: f.id, name: f.name, kind: f.kind === "drink" ? "drink" : "food", size: nul(f.size), archived_at: f.archivedAt || null, category: nul(f.category), status: f.status, confidence: f.confidence, last_tested: nul(f.lastTested), updated_at: stamp(f.updatedAt) }),
    fromRow: (r) => ({ id: r.id, name: r.name, kind: r.kind || "food", size: str(r.size), archivedAt: r.archived_at || "", category: str(r.category), status: r.status, confidence: r.confidence, lastTested: str(r.last_tested), updatedAt: stamp(r.updated_at) }),
  },
  interventions: {
    table: "interventions", order: "start_date",
    toRow: (i) => ({ id: i.id, name: i.name, type: i.type, dose: nul(doseLabel(i)), dose_amount: i.doseAmount ?? null, dose_unit: nul(i.doseUnit), dose_note: nul(i.doseNote), source: nul(i.source), start_date: nul(i.start), end_date: nul(i.end), status: i.status, outcome: nul(i.outcome), intensity: nul(i.intensity), archived_at: i.archivedAt || null, doses_per_day: i.dosesPerDay || 1, days: i.days?.length && i.days.length < 7 ? i.days : null, times: (i.times || []).filter(Boolean).length ? i.times.filter(Boolean) : null, updated_at: stamp(i.updatedAt) }),
    fromRow: (r) => ({ id: r.id, name: r.name, type: r.type, dose: str(r.dose), doseAmount: r.dose_amount == null ? null : Number(r.dose_amount), doseUnit: str(r.dose_unit), doseNote: str(r.dose_note), source: str(r.source), start: str(r.start_date), end: str(r.end_date), status: r.status, outcome: str(r.outcome), intensity: str(r.intensity), archivedAt: r.archived_at || "", dosesPerDay: r.doses_per_day || 1, days: r.days?.length ? r.days : null, times: r.times || [], updatedAt: stamp(r.updated_at) }),
  },
  meals: {
    table: "meal_plan", order: "date",
    toRow: (m) => ({ id: m.id, date: m.date, meal: m.meal, items: nul(m.items), plan_key: m.planKey || `${m.meal}|${m.items}`, updated_at: stamp(m.updatedAt) }),
    fromRow: (r) => ({ id: r.id, date: r.date, meal: r.meal, items: str(r.items), planKey: r.plan_key, updatedAt: stamp(r.updated_at) }),
  },
  workouts: {
    table: "workout_plan", order: "date",
    toRow: (w) => ({ id: w.id, date: w.date, workout: w.workout, details: nul(w.details), plan_key: w.planKey || `${w.workout}|${w.details}`, updated_at: stamp(w.updatedAt) }),
    fromRow: (r) => ({ id: r.id, date: r.date, workout: r.workout, details: str(r.details), planKey: r.plan_key, updatedAt: stamp(r.updated_at) }),
  },
};

// A stable fingerprint of a row, so "did this change?" is a string compare.
// Keys are sorted at every level so object key order can't produce a false diff.
const sig = (v) => JSON.stringify(v, (_k, x) =>
  x && typeof x === "object" && !Array.isArray(x)
    ? Object.keys(x).sort().reduce((o, k) => { o[k] = x[k]; return o; }, {})
    : x);

// What the database held after the last successful load or save:
// collection -> Map(id -> fingerprint). saveAll diffs against this.
let last = {};
// Saves run one at a time, in order, so two quick clicks can't race each other.
let queue = Promise.resolve();

async function requireUser() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("not signed in");
  return data.session.user.id;
}

async function sync(data) {
  const userId = await requireUser();
  for (const key of Object.keys(TABLES)) {
    const { table, toRow } = TABLES[key];
    const rows = data[key] || [];
    if (rows.some((r) => !r.id)) throw new Error(`${key}: a row has no id`);
    const prev = last[key] || new Map();
    const next = new Map(rows.map((r) => [r.id, sig(r)]));
    const gone = [...prev.keys()].filter((id) => !next.has(id));
    const changed = rows.filter((r) => prev.get(r.id) !== next.get(r.id));

    // Every query filters by user_id. RLS is the safety net, not the plan.
    if (gone.length) {
      const { error } = await supabase.from(table).delete().eq("user_id", userId).in("id", gone);
      if (error) throw new Error(error.message);
    }
    if (changed.length) {
      const opts = table === "entries" ? { onConflict: "user_id,date" } : undefined;
      const { error } = await supabase.from(table).upsert(changed.map((r) => ({ user_id: userId, ...toRow(r) })), opts);
      if (error) throw new Error(error.message);
    }
    last[key] = next;
  }
  return true;
}

const supabaseStore = {
  async load() {
    const userId = await requireUser();
    const keys = Object.keys(TABLES);
    const results = await Promise.all(keys.map((k) =>
      supabase.from(TABLES[k].table).select("*").eq("user_id", userId).order(TABLES[k].order)));
    const out = { ...EMPTY };
    keys.forEach((k, i) => {
      const { data: rows, error } = results[i];
      if (error) throw new Error(`${TABLES[k].table}: ${error.message}`);
      out[k] = rows.map(TABLES[k].fromRow);
    });
    const d = migrate(out);
    d.changes = await this.loadChanges().catch(() => []);
    last = {};
    keys.forEach((k) => { last[k] = new Map(d[k].map((r) => [r.id, sig(r)])); });
    return d;
  },

  saveAll(data) {
    const run = queue.then(() => sync(data));
    queue = run.catch(() => {}); // a failed save must not block the next one
    return run;
  },

  // Append-only history of Index changes and removed days, written by the
  // database. Oldest first.
  async loadChanges() {
    const userId = await requireUser();
    const { data, error } = await supabase.from("change_log").select("at, tbl, row_id, name, action, field, old_value, new_value").eq("user_id", userId).order("at", { ascending: true }).limit(10000);
    if (error) throw new Error(error.message);
    return (data || []).map((r) => ({ at: r.at, tbl: r.tbl, rowId: r.row_id, name: r.name, action: r.action, field: r.field, oldValue: r.old_value, newValue: r.new_value }));
  },

  // Exported reports: kept permanently, with their full content.
  async listReports() {
    const userId = await requireUser();
    const { data, error } = await supabase.from("reports").select("id, created_at, range_from, range_to, title, content").eq("user_id", userId).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data || []).map((r) => ({ id: r.id, createdAt: r.created_at, from: r.range_from, to: r.range_to, title: r.title, content: r.content }));
  },
  async saveReport(r) {
    const userId = await requireUser();
    const { error } = await supabase.from("reports").insert({ user_id: userId, id: r.id, range_from: r.from, range_to: r.to, title: r.title, content: r.content });
    if (error) throw new Error(error.message);
    return true;
  },

  // The signed-in person's profile row: plan and the like.
  async profile() {
    const userId = await requireUser();
    const { data } = await supabase.from("profiles").select("plan, phone, marketing_texts").eq("id", userId).maybeSingle();
    return data || { plan: "free" };
  },

  // Only phone and texting consent can be changed from the browser; the
  // database refuses anything else on profiles.
  async updateProfile(patch) {
    const userId = await requireUser();
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return true;
  },

  // Theme and the like belong to the device, not the account.
  async pref(k, v) {
    if (v === undefined) return localStorage.getItem(`${KEY}:${k}`);
    localStorage.setItem(`${KEY}:${k}`, v);
    return v;
  },
};

// The boundary the rest of the app imports. One line decides which backend.
export const store = LOCAL_ONLY ? localStore : supabaseStore;
