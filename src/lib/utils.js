// Shared helpers and constants. Pure functions only — nothing here touches
// storage or React. Every other module imports what it needs from here.
import { parseDose, normUnit } from "./dose.js";

export const KEY = "health-tracker-v1";
export const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
export const today = () => iso(new Date());
export const addDays = (ds, n) => { const d = new Date(ds + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
export const uid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2, 9));
export const SCHEMA = 2;
export const EMPTY = { schema: SCHEMA, entries: [], foods: [], interventions: [], meals: [], workouts: [] };
export const now = () => new Date().toISOString();

// Normalizes any older saved shape forward. Every row ends up with a stable id
// and updatedAt, which is what a server sync will need to merge safely.
export function migrate(raw) {
  const d = { ...EMPTY, ...(raw || {}) };
  const stamp = (r) => ({ ...r, id: r.id || uid(), updatedAt: r.updatedAt || now() });
  d.foods = (d.foods || []).map((x) => ({ ...stamp(x), kind: x.kind || "food", size: x.size || "" }));
  // Free-text doses ("200 mg, evening") become numbers the first time they're seen.
  // Old kinds map forward; every item gets a schedule (null days = every day).
  d.interventions = (d.interventions || []).map((i0) => {
    const i = (i0.doseAmount == null && !i0.doseNote && i0.dose) ? { ...stamp(i0), ...parseDose(i0.dose) } : stamp(i0);
    return { ...i, doseUnit: normUnit(i.doseUnit), type: OLD_TYPE[i.type] || i.type, dosesPerDay: i.dosesPerDay || 1, days: i.days?.length ? i.days : null, times: i.times || [] };
  });
  d.meals = (d.meals || []).map((m) => ({ ...stamp(m), planKey: m.planKey || `${m.meal}|${m.items}` }));
  d.workouts = (d.workouts || []).map((w) => ({ ...stamp(w), planKey: w.planKey || `${w.workout}|${w.details}` }));
  d.entries = (d.entries || []).map((e) => {
    const { sleep, ...rest } = e;
    return { ...stamp(rest), doses: rest.doses || {}, drinks: rest.drinks || [], activityStatus: rest.activityStatus || {}, routineExtras: rest.routineExtras || [], extras: (rest.extras || []).map(stamp), extraWorkouts: (rest.extraWorkouts || []).map(stamp) };
  });
  d.deleted = d.deleted || [];
  d.schema = SCHEMA;
  return d;
}
export const FOOD_STATUS = ["tolerated", "not tolerated", "unknown", "testing"];
export const CONFIDENCE = ["low", "medium", "high"];
// Kinds of things in the Index. Each gets its own section there and its own
// group in the Day view's routine. Activities are marked done / modified /
// skipped; everything else is checked off with an amount.
export const INT_TYPE = ["supplement", "medication", "treatment", "activity"];
export const KIND_LABEL = { supplement: "Supplements", medication: "Medications", treatment: "Treatments", activity: "Activities" };
const OLD_TYPE = { western: "medication", naturopathic: "treatment", lifestyle: "activity" };
export const isActivity = (i) => i.type === "activity" || i.type === "lifestyle";
// Treatments and activities are answered done or skipped (entries.activity_status);
// supplements and medications are checked off as taken (entries.taken).
export const usesStatus = (i) => isActivity(i) || i.type === "treatment";

// Scheduling. days: null = every day, else weekday numbers 0 (Sun) .. 6 (Sat).
export const DAY_SHORT = ["S", "M", "T", "W", "T", "F", "S"];
export const DAY_NAME = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const weekday = (ds) => new Date(ds + "T12:00:00").getDay();
export const scheduledOn = (i, ds) => !i.days || !i.days.length || i.days.includes(weekday(ds));
export const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? ":" + String(m).padStart(2, "0") : ""}${h < 12 ? "a" : "p"}`;
};
export function scheduleLabel(i) {
  const d = !i.days || !i.days.length || i.days.length === 7 ? "Daily"
    : [...i.days].sort().join() === "1,2,3,4,5" ? "Weekdays"
    : [...i.days].sort().join() === "0,6" ? "Weekends"
    : [...i.days].sort().map((n) => DAY_NAME[n]).join(", ");
  const t = (i.times || []).filter(Boolean).map(fmtTime).join(", ");
  return t ? `${d} · ${t}` : d;
}
export const INT_STATUS = ["baseline", "testing", "established", "discontinued"];
export const ACTIVITY = ["rest", "light", "moderate", "hard"];
// On the routine for a given day: started, not ended, not discontinued, and
// scheduled for that weekday.
export const activeOn = (data, ds) => data.interventions.filter((i) => i.start && i.start <= ds && (!i.end || i.end >= ds) && i.status !== "discontinued" && scheduledOn(i, ds));
export const isOn = (i) => !i.end || i.end >= today();
export const mealKey = (m) => `${m.meal}|${m.items}`;
export const mealsOn = (data, e, ds) => {
  const planned = data.meals.filter((m) => m.date === ds);
  if (!planned.length) return null;
  const eaten = (e?.meals || []).filter((k) => planned.some((m) => mealKey(m) === k)).length;
  return { eaten, planned: planned.length };
};
export const woKey = (w) => `${w.workout}|${w.details}`;
export const workoutsOn = (data, e, ds) => {
  const planned = (data.workouts || []).filter((w) => w.date === ds);
  const st = e?.woStatus || {};
  const extra = (e?.extraWorkouts || []).length;
  if (!planned.length && !extra) return null;
  const done = planned.filter((w) => st[woKey(w)] === "done").length;
  const mod = planned.filter((w) => st[woKey(w)] === "modified").length;
  const skip = planned.filter((w) => st[woKey(w)] === "skipped").length;
  return { planned: planned.length, done, mod, skip, extra };
};

export const normDate = (d) => {
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) { const yr = m[3].length === 2 ? "20" + m[3] : m[3]; return `${yr}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`; }
  const p = new Date(s);
  return isNaN(p) ? null : iso(p);
};
export const logged = (e) => e && e.energy != null;
// Anything at all recorded for the day (kept for future use). A day counts
// as "missed" for the routine only once its ratings are filled in, or once
// something on it has been checked off. A day with nothing is left blank
// everywhere: never shown as missed, never counted in insights.
export const touched = (e) => !!e && (logged(e) || e.inflammation != null || e.clarity != null || e.stress != null || !!e.notes?.trim()
  || (e.taken || []).length > 0 || (e.meals || []).length > 0 || (e.extras || []).length > 0 || (e.drinks || []).length > 0
  || (e.extraWorkouts || []).length > 0 || (e.routineExtras || []).length > 0 || Object.keys(e.activityStatus || {}).length > 0 || Object.keys(e.woStatus || {}).length > 0);
export const adherence = (data, e, ds) => {
  const due = activeOn(data, ds).filter((i) => !usesStatus(i));
  if (!due.length) return null;
  const taken = (e?.taken || []).filter((id) => due.some((i) => i.id === id)).length;
  return { taken, due: due.length };
};
export const testingOn = (data, ds) => {
  const i = data.interventions.find((x) => x.status === "testing" && x.start && x.start <= ds && (!x.end || x.end >= ds));
  if (i) return i.name;
  const f = data.foods.find((x) => x.status === "testing" && x.lastTested && x.lastTested <= ds);
  return f ? f.name : null;
};
export const fmtLong = (ds) => new Date(ds + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
export const fmtShort = (ds) => new Date(ds + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
