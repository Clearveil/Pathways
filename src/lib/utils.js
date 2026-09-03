// Shared helpers and constants. Pure functions only — nothing here touches
// storage or React. Every other module imports what it needs from here.

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
  d.foods = (d.foods || []).map(stamp);
  d.interventions = (d.interventions || []).map(stamp);
  d.meals = (d.meals || []).map((m) => ({ ...stamp(m), planKey: m.planKey || `${m.meal}|${m.items}` }));
  d.workouts = (d.workouts || []).map((w) => ({ ...stamp(w), planKey: w.planKey || `${w.workout}|${w.details}` }));
  d.entries = (d.entries || []).map((e) => {
    const { sleep, ...rest } = e;
    return { ...stamp(rest), extras: (rest.extras || []).map(stamp), extraWorkouts: (rest.extraWorkouts || []).map(stamp) };
  });
  d.deleted = d.deleted || [];
  d.schema = SCHEMA;
  return d;
}
export const FOOD_STATUS = ["tolerated", "not tolerated", "unknown", "testing"];
export const CONFIDENCE = ["low", "medium", "high"];
export const INT_TYPE = ["supplement", "western", "naturopathic", "lifestyle"];
export const INT_STATUS = ["baseline", "testing", "established", "discontinued"];
export const ACTIVITY = ["rest", "light", "moderate", "hard"];
export const activeOn = (data, ds) => data.interventions.filter((i) => i.start && i.start <= ds && (!i.end || i.end >= ds) && i.status !== "discontinued");
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
export const adherence = (data, e, ds) => {
  const due = activeOn(data, ds).filter((i) => i.type !== "lifestyle");
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
