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
      energy: e.energy ?? null, inflammation: e.inflammation ?? null,
      flare: !!e.flare, severity: e.severity ?? null,
      activity: nul(e.activity), activity_note: nul(e.activityNote), notes: nul(e.notes),
      taken: e.taken || [], meals_done: e.meals || [], wo_status: e.woStatus || {},
      extras: e.extras || [], extra_workouts: e.extraWorkouts || [],
      updated_at: stamp(e.updatedAt),
    }),
    fromRow: (r) => ({
      id: r.id, date: r.date,
      energy: r.energy, inflammation: r.inflammation, flare: r.flare, severity: r.severity,
      activity: str(r.activity), activityNote: str(r.activity_note), notes: str(r.notes),
      taken: r.taken || [], meals: r.meals_done || [], woStatus: r.wo_status || {},
      extras: r.extras || [], extraWorkouts: r.extra_workouts || [],
      updatedAt: stamp(r.updated_at),
    }),
  },
  foods: {
    table: "foods", order: "name",
    toRow: (f) => ({ id: f.id, name: f.name, category: nul(f.category), status: f.status, confidence: f.confidence, last_tested: nul(f.lastTested), updated_at: stamp(f.updatedAt) }),
    fromRow: (r) => ({ id: r.id, name: r.name, category: str(r.category), status: r.status, confidence: r.confidence, lastTested: str(r.last_tested), updatedAt: stamp(r.updated_at) }),
  },
  interventions: {
    table: "interventions", order: "start_date",
    toRow: (i) => ({ id: i.id, name: i.name, type: i.type, dose: nul(i.dose), source: nul(i.source), start_date: nul(i.start), end_date: nul(i.end), status: i.status, outcome: nul(i.outcome), updated_at: stamp(i.updatedAt) }),
    fromRow: (r) => ({ id: r.id, name: r.name, type: r.type, dose: str(r.dose), source: str(r.source), start: str(r.start_date), end: str(r.end_date), status: r.status, outcome: str(r.outcome), updatedAt: stamp(r.updated_at) }),
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
      const { error } = await supabase.from(table).upsert(changed.map((r) => ({ user_id: userId, ...toRow(r) })));
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
    last = {};
    keys.forEach((k) => { last[k] = new Map(d[k].map((r) => [r.id, sig(r)])); });
    return d;
  },

  saveAll(data) {
    const run = queue.then(() => sync(data));
    queue = run.catch(() => {}); // a failed save must not block the next one
    return run;
  },

  // The signed-in person's profile row: plan and the like.
  async profile() {
    const userId = await requireUser();
    const { data } = await supabase.from("profiles").select("plan").eq("id", userId).maybeSingle();
    return data || { plan: "free" };
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
