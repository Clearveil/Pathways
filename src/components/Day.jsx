import { useState, useEffect } from "react";
import { today, addDays, uid, now, ACTIVITY, INT_TYPE, KIND_LABEL, activeOn, isActivity, mealKey, woKey, logged, fmtLong, fmtTime } from "../lib/utils.js";
import { Trash } from "./Icons.jsx";
import Repeat from "./Repeat.jsx";
import { DOSE_UNITS, TIME_UNITS, doseLabel, doseStep, fmtAmt, partsOf, portionOf, unitFor } from "../lib/dose.js";

// The day's overall activity level, taken from what was actually done:
// the hardest activity marked done (Index activities by their intensity,
// one-offs by theirs). It replaces a level that was set automatically and
// only ever raises one picked by hand, so checking off a workout can't
// leave the day saying "rest".
const LEVEL_RANK = { "": 0, rest: 0, light: 1, moderate: 2, hard: 3 };
export function withAutoLevel(next, interventions) {
  const st = next.activityStatus || {};
  const fromIndex = interventions.filter((i) => isActivity(i) && i.intensity && (st[i.id] === "done" || st[i.id] === "modified")).map((i) => i.intensity);
  const fromOneOffs = (next.extraWorkouts || []).map((x) => x.intensity).filter(Boolean);
  const top = [...fromIndex, ...fromOneOffs].sort((a, b) => LEVEL_RANK[b] - LEVEL_RANK[a])[0] || "";
  if (next.activityAuto || !next.activity) return { ...next, activity: top, activityAuto: !!top };
  if (LEVEL_RANK[top] > LEVEL_RANK[next.activity]) return { ...next, activity: top, activityAuto: true };
  return next;
}
const INTENSITY = ["light", "moderate", "hard"];

const SINGULAR = { supplement: "supplement", medication: "medication", treatment: "treatment", activity: "activity" };

// Most recent distinct items from the last `days` days of entries, newest
// first. `pick(entry)` returns that day's items; `key(item)` dedupes.
function recent(entries, date, pick, key, limit = 8, days = 45) {
  const seen = new Set(), out = [];
  [...entries].filter((e) => e.date !== date && e.date >= addDays(date, -days)).sort((a, b) => b.date.localeCompare(a.date))
    .forEach((e) => (pick(e) || []).forEach((x) => { const k = key(x); if (!seen.has(k) && out.length < limit) { seen.add(k); out.push(x); } }));
  return out;
}

// A 1-10 rating row. All four daily ratings share it so they look and
// behave identically.
function Scale({ label, hint, value, onPick, max = 10 }) {
  return (
    <div className="ht-field">{label}{hint && <span className="hint" style={{ marginTop: -4 }}>{hint}</span>}
      <div className="scale">{Array.from({ length: max }, (_, k) => k + 1).map((n) => <button key={n} type="button" className={value === n ? "on" : ""} onClick={() => onPick(n)}>{n}</button>)}</div>
    </div>
  );
}

// Three-state marker for anything you do rather than take: planned workouts
// and routine activities. Skipped is a grey dash, never a red X.
const NEXT_STATE = { undefined: "done", done: "skipped", modified: "skipped", skipped: undefined };
function StateBox({ st }) {
  return <span className={"box" + (st === "skipped" ? " skip" : st === "modified" ? " mod" : "")}>{st === "done" ? "✓" : st === "modified" ? "~" : st === "skipped" ? "–" : ""}</span>;
}
const TimeChip = ({ i }) => (i.times || []).filter(Boolean).length ? <span className="time-chip">{i.times.filter(Boolean).map(fmtTime).join(" · ")}</span> : null;

export default function Day({ data, save, date, setDate }) {
  const existing = data.entries.find((e) => e.date === date);
  const [f, setF] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [addingMeal, setAddingMeal] = useState(false);
  const [newMeal, setNewMeal] = useState({ meal: "", items: "" });
  const [editingExtra, setEditingExtra] = useState(null); // id of the off-plan food being edited
  const [addingDrink, setAddingDrink] = useState(false);
  const [newDrink, setNewDrink] = useState({ name: "", size: "" });
  const [editingDrink, setEditingDrink] = useState(null);
  const [addingWo, setAddingWo] = useState(false);
  const [newWo, setNewWo] = useState({ workout: "", details: "" });
  const [woMode, setWoMode] = useState(""); // "" | "index" | "new"
  const [woPick, setWoPick] = useState("");
  const [addingRoutine, setAddingRoutine] = useState(false);
  const blankRoutine = { mode: "", pick: "", name: "", kind: "supplement", amount: "", unit: "mg" };
  const [newRoutine, setNewRoutine] = useState(blankRoutine);
  useEffect(() => { setConfirmRemove(false); setAddingRoutine(false); }, [date]);
  useEffect(() => { setF(existing || { date, energy: null, inflammation: null, clarity: null, stress: null, flare: false, severity: 3, activity: "", activityNote: "", notes: "", taken: [], doses: {}, meals: [], extras: [], drinks: [], activityStatus: {}, routineExtras: [] }); }, [date, existing]);
  if (!f) return null;

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => { if (f.energy == null) return; saveEntry({ ...f, date }); };
  const isLogged = logged(existing);
  const saveEntry = (next) => { const row = { ...next, id: next.id || uid(), updatedAt: now() }; setF(row); save({ ...data, entries: [...data.entries.filter((e) => e.date !== date), row].sort((a, b) => a.date.localeCompare(b.date)) }); };
  // Drops the whole entry for this day: ratings, notes, checklists, extras.
  // Plans stay; they belong to the calendar, not the day.
  const removeEntry = () => { setConfirmRemove(false); save({ ...data, entries: data.entries.filter((e) => e.date !== date) }); };

  // ---- Food --------------------------------------------------------------
  const meals = data.meals.filter((m) => m.date === date);
  const toggleMeal = (k) => saveEntry({ ...f, date, meals: f.meals?.includes(k) ? f.meals.filter((x) => x !== k) : [...(f.meals || []), k] });
  // Off-plan food. Each item carries a quantity (servings) so "two of those
  // crackers" is one entry with qty 2, not two entries.
  const addExtra = () => {
    if (!newMeal.items.trim()) return;
    const item = { meal: newMeal.meal.trim() || "meal", items: newMeal.items.trim() };
    const extras = editingExtra
      ? (f.extras || []).map((x) => x.id === editingExtra ? { ...x, ...item } : x)
      : [...(f.extras || []), { id: uid(), qty: 1, ...item }];
    saveEntry({ ...f, date, extras });
    setNewMeal({ meal: "", items: "" }); setAddingMeal(false); setEditingExtra(null);
  };
  const editExtra = (x) => { setNewMeal({ meal: x.meal === "meal" ? "" : x.meal, items: x.items }); setEditingExtra(x.id); setAddingMeal(true); };
  const cancelExtra = () => { setNewMeal({ meal: "", items: "" }); setAddingMeal(false); setEditingExtra(null); };
  const bumpExtra = (id, delta) => saveEntry({ ...f, date, extras: (f.extras || []).map((x) => x.id === id ? { ...x, qty: Math.max(1, (x.qty || 1) + delta) } : x) });
  const removeExtra = (id) => saveEntry({ ...f, date, extras: (f.extras || []).filter((x) => x.id !== id) });
  // Repeat: re-log something eaten recently, or a food saved in the Index.
  const putExtra = (x) => {
    const list = f.extras || [];
    const hit = list.find((y) => y.items.toLowerCase() === x.items.toLowerCase() && y.meal === x.meal);
    saveEntry({ ...f, date, extras: hit ? list.map((y) => y === hit ? { ...y, qty: (y.qty || 1) + 1 } : y) : [...list, { id: uid(), qty: 1, meal: x.meal || "meal", items: x.items }] });
  };
  const indexFoods = data.foods.filter((x) => (x.kind || "food") === "food");
  const indexDrinks = data.foods.filter((x) => x.kind === "drink");
  const foodRepeat = [
    ...recent(data.entries, date, (e) => e.extras, (x) => `${x.items.toLowerCase()}|${x.meal}`).map((x) => ({ key: "r" + x.items + x.meal, label: x.items, detail: x.meal !== "meal" ? x.meal : "recent", onPick: () => putExtra(x) })),
    ...indexFoods.filter((x) => x.status !== "not tolerated").slice(0, 8).map((x) => ({ key: "i" + x.id, label: x.name, detail: "from your Index", onPick: () => putExtra({ items: x.name, meal: "meal" }) })),
  ].filter((it, k, a) => a.findIndex((b) => b.label.toLowerCase() === it.label.toLowerCase()) === k);

  // ---- Drinks ------------------------------------------------------------
  // Their own list, not mixed into food. Same name + size on the same day
  // bumps the count instead of adding a duplicate line.
  const drinkKey = (d) => `${d.name.toLowerCase().trim()}|${(d.size || "").toLowerCase().trim()}`;
  const putDrink = (d) => {
    const list = f.drinks || [];
    const hit = list.find((x) => drinkKey(x) === drinkKey(d));
    saveEntry({ ...f, date, drinks: hit ? list.map((x) => x === hit ? { ...x, qty: (x.qty || 1) + 1 } : x) : [...list, { id: uid(), name: d.name.trim(), size: (d.size || "").trim(), qty: 1 }] });
  };
  const submitDrink = () => {
    if (!newDrink.name.trim()) return;
    if (editingDrink) saveEntry({ ...f, date, drinks: (f.drinks || []).map((x) => x.id === editingDrink ? { ...x, name: newDrink.name.trim(), size: newDrink.size.trim() } : x) });
    else putDrink(newDrink);
    setNewDrink({ name: "", size: "" }); setAddingDrink(false); setEditingDrink(null);
  };
  const editDrink = (x) => { setNewDrink({ name: x.name, size: x.size || "" }); setEditingDrink(x.id); setAddingDrink(true); };
  const cancelDrink = () => { setNewDrink({ name: "", size: "" }); setAddingDrink(false); setEditingDrink(null); };
  const bumpDrink = (id, delta) => saveEntry({ ...f, date, drinks: (f.drinks || []).map((x) => x.id === id ? { ...x, qty: Math.max(1, (x.qty || 1) + delta) } : x) });
  const removeDrink = (id) => saveEntry({ ...f, date, drinks: (f.drinks || []).filter((x) => x.id !== id) });
  // Repeat: recent drinks first, then drinks saved in the Index.
  const drinkRepeat = [
    ...recent(data.entries, date, (e) => e.drinks, drinkKey).map((d) => ({ key: "r" + drinkKey(d), label: d.name, detail: d.size || "recent", onPick: () => putDrink(d) })),
    ...indexDrinks.filter((x) => x.status !== "not tolerated").map((x) => ({ key: "i" + x.id, label: x.name, detail: x.size || "from your Index", onPick: () => putDrink({ name: x.name, size: x.size || "" }) })),
  ].filter((it, k, a) => a.findIndex((b) => b.label.toLowerCase() === it.label.toLowerCase() && b.detail === it.detail) === k).slice(0, 10);
  // Typing a drink that's in the Index fills in its usual size.
  const onDrinkName = (name) => {
    const hit = indexDrinks.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    setNewDrink((d) => ({ name, size: d.size || !hit ? d.size : hit.size || "" }));
  };

  // ---- Activity (planned workouts and one-offs) ---------------------------
  const plannedWo = (data.workouts || []).filter((w) => w.date === date);
  const cycleWo = (k) => {
    const woStatus = { ...(f.woStatus || {}) };
    const nx = NEXT_STATE[woStatus[k]];
    if (nx) woStatus[k] = nx; else delete woStatus[k];
    saveEntry({ ...f, date, woStatus });
  };
  const saveAct = (next) => saveEntry(withAutoLevel(next, data.interventions));
  const addWo = () => {
    if (!newWo.workout.trim()) return;
    saveAct({ ...f, date, extraWorkouts: [...(f.extraWorkouts || []), { id: uid(), workout: newWo.workout.trim(), details: newWo.details.trim(), intensity: newWo.intensity || "" }] });
    setNewWo({ workout: "", details: "", intensity: "" }); setAddingWo(false);
  };
  const removeWo = (id) => saveAct({ ...f, date, extraWorkouts: (f.extraWorkouts || []).filter((x) => x.id !== id) });

  // ---- Routine and activities -------------------------------------------
  // Supplements, medications and treatments live in Today's routine;
  // activities scheduled in the Index live in the Activity card.
  // Supplements and medications are checked off with an amount.
  // Treatments and activities are answered done or skipped: a skip is an
  // explicit answer and is recorded; leaving it blank records nothing, so
  // insights can tell "chose not to" apart from "didn't log".
  const byTime = (a, b) => ((a.times || []).find(Boolean) || "99").localeCompare((b.times || []).find(Boolean) || "99") || a.name.localeCompare(b.name);
  const scheduled = activeOn(data, date).sort(byTime);
  const onSchedule = new Set(scheduled.map((i) => i.id));
  const usesState = (i) => isActivity(i) || i.type === "treatment";
  const stOf = (i) => (f.activityStatus || {})[i.id];
  // Index items not scheduled today but taken or done anyway.
  const offSchedule = data.interventions.filter((i) => !onSchedule.has(i.id) && (f.taken?.includes(i.id) || stOf(i))).sort(byTime);
  const routine = scheduled.filter((i) => !isActivity(i));
  const routineShown = [...routine, ...offSchedule.filter((i) => !isActivity(i))];
  const actScheduled = scheduled.filter(isActivity);
  const actShown = [...actScheduled, ...offSchedule.filter(isActivity)];
  const kindOf = (i) => isActivity(i) ? "activity" : i.type;
  const ROUTINE_KINDS = ["supplement", "medication", "treatment"];
  const groups = ROUTINE_KINDS.map((k) => [k, routineShown.filter((i) => kindOf(i) === k)]).filter(([, items]) => items.length);
  const answered = (i) => usesState(i) ? !!stOf(i) : !!f.taken?.includes(i.id);
  const doneCount = routine.filter(answered).length;
  const firstAmount = (i) => partsOf(i) > 1 ? portionOf(i) : i.doseAmount;
  const stepFor = (i) => partsOf(i) > 1 ? portionOf(i) : doseStep(i.doseAmount, i.doseUnit);
  const toggleTaken = (i) => {
    const on = f.taken?.includes(i.id);
    const taken = on ? f.taken.filter((x) => x !== i.id) : [...(f.taken || []), i.id];
    const doses = { ...(f.doses || {}) };
    if (on) delete doses[i.id]; else if (i.doseAmount != null) doses[i.id] = firstAmount(i);
    saveEntry({ ...f, taken, doses, date });
  };
  const setState = (i, state) => {
    const activityStatus = { ...(f.activityStatus || {}) };
    const doses = { ...(f.doses || {}) };
    if (state) activityStatus[i.id] = state; else delete activityStatus[i.id];
    if (state === "done" && i.doseAmount != null) doses[i.id] = doses[i.id] ?? firstAmount(i);
    if (state !== "done") delete doses[i.id];
    (isActivity(i) ? saveAct : saveEntry)({ ...f, date, activityStatus, doses });
  };
  const cycleState = (i) => setState(i, NEXT_STATE[stOf(i)]);
  const adjustDose = (i, delta) => {
    const doses = { ...(f.doses || {}) };
    const cur = doses[i.id] ?? firstAmount(i) ?? 0;
    const next = Math.max(0, Math.round((cur + delta) * 100) / 100);
    if (next === 0) return usesState(i) ? setState(i, undefined) : toggleTaken(i);
    doses[i.id] = next;
    if (usesState(i)) saveEntry({ ...f, date, doses, activityStatus: { ...(f.activityStatus || {}), [i.id]: "done" } });
    else saveEntry({ ...f, taken: f.taken?.includes(i.id) ? f.taken : [...(f.taken || []), i.id], doses, date });
  };
  const addFromIndex = (i) => {
    if (usesState(i)) { if (stOf(i) !== "done") setState(i, "done"); return; }
    if (f.taken?.includes(i.id)) return;
    const doses = { ...(f.doses || {}) };
    if (i.doseAmount != null) doses[i.id] = firstAmount(i);
    saveEntry({ ...f, date, taken: [...(f.taken || []), i.id], doses });
  };
  const testingFoods = data.foods.filter((x) => x.status === "testing");
  const notToday = data.interventions.filter((i) => i.status !== "discontinued" && !onSchedule.has(i.id) && !offSchedule.some((o) => o.id === i.id));
  const notTodayRoutine = notToday.filter((i) => !isActivity(i));
  const notTodayActs = notToday.filter(isActivity);

  // Activity card: + Add picks an Index activity not scheduled today, or
  // logs a one-off. Repeat offers both, activities only.
  const pickWo = () => { const i = data.interventions.find((x) => x.id === woPick); if (i) addFromIndex(i); closeWo(); };
  const closeWo = () => { setAddingWo(false); setWoMode(""); setWoPick(""); setNewWo({ workout: "", details: "" }); };
  const woRepeat = [
    ...notTodayActs.map((i) => ({ key: "i" + i.id, label: i.name, detail: [i.doseNote, i.intensity, "not scheduled today"].filter(Boolean).join(" · "), onPick: () => addFromIndex(i) })),
    ...recent(data.entries, date, (e) => e.extraWorkouts, (x) => `${x.workout.toLowerCase()}|${(x.details || "").toLowerCase()}`, 8, 120)
      .filter((x) => !(f.extraWorkouts || []).some((y) => y.workout === x.workout && y.details === x.details))
      .map((x) => ({ key: "r" + x.workout + x.details, label: x.workout, detail: [x.details, x.intensity].filter(Boolean).join(" · ") || "recent", onPick: () => saveAct({ ...f, date, extraWorkouts: [...(f.extraWorkouts || []), { id: uid(), workout: x.workout, details: x.details || "", intensity: x.intensity || "" }] }) })),
  ];

  // Routine card: + Add starts with a choice — from the Index, or something
  // that isn't in it — so the list of options doesn't land all at once.
  const putRoutineExtra = (x) => {
    const list = f.routineExtras || [];
    const hit = list.find((y) => y.name.toLowerCase() === x.name.toLowerCase() && y.kind === x.kind);
    saveEntry({ ...f, date, routineExtras: hit ? list.map((y) => y === hit ? { ...y, qty: (y.qty || 1) + 1 } : y) : [...list, { id: uid(), name: x.name, kind: x.kind, amount: x.amount ?? null, unit: x.unit || "", qty: 1 }] });
  };
  const submitRoutine = () => {
    const n = newRoutine;
    if (n.mode === "index") { const i = data.interventions.find((x) => x.id === n.pick); if (!i) return; addFromIndex(i); }
    else if (n.mode === "new" && n.name.trim()) { const noAmt = n.amount === ""; putRoutineExtra({ name: n.name.trim(), kind: n.kind, amount: noAmt ? null : Number(n.amount), unit: noAmt ? "" : n.unit }); }
    else return;
    setNewRoutine(blankRoutine); setAddingRoutine(false);
  };
  const bumpRoutineExtra = (id, delta) => saveEntry({ ...f, date, routineExtras: (f.routineExtras || []).map((x) => x.id === id ? { ...x, qty: Math.max(1, (x.qty || 1) + delta) } : x) });
  const removeRoutineExtra = (id) => saveEntry({ ...f, date, routineExtras: (f.routineExtras || []).filter((x) => x.id !== id) });
  const routineRepeat = [
    ...notTodayRoutine.map((i) => ({ key: "i" + i.id, label: i.name, detail: `${SINGULAR[kindOf(i)]}${doseLabel(i) ? " · " + doseLabel(i) : ""} · not scheduled today`, onPick: () => addFromIndex(i) })),
    ...recent(data.entries, date, (e) => (e.routineExtras || []).filter((x) => x.kind !== "activity"), (x) => `${x.name.toLowerCase()}|${x.kind}`)
      .filter((x) => !(f.routineExtras || []).some((y) => y.name.toLowerCase() === x.name.toLowerCase()))
      .map((x) => ({ key: "x" + x.name + x.kind, label: x.name, detail: `${SINGULAR[x.kind] || x.kind}${x.amount != null ? ` · ${fmtAmt(x.amount)} ${unitFor(x.amount, x.unit)}` : ""} · one-off`, onPick: () => putRoutineExtra(x) })),
  ];

  const Stepper = ({ i, amt, changed }) => (
    <span className="dose-ctl" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => adjustDose(i, -stepFor(i))} aria-label="Less">−</button>
      <span className={"amt" + (changed ? " changed" : "")}>{fmtAmt(amt)} {unitFor(amt, i.doseUnit)}</span>
      <button type="button" onClick={() => adjustDose(i, stepFor(i))} aria-label="More">+</button>
    </span>
  );
  const Dots = ({ i, amt }) => {
    const parts = partsOf(i), portion = portionOf(i);
    if (parts < 2 || !portion) return null;
    const n = Math.min(parts, Math.round(amt / portion));
    return <span className="dose-dots" title={`${n} of ${parts} doses`} aria-label={`${n} of ${parts} doses`}>{Array.from({ length: parts }, (_, k) => <span key={k} className={k < n ? "on" : ""} />)}</span>;
  };
  const renderTake = (i) => {
    const on = f.taken?.includes(i.id);
    const parts = partsOf(i);
    const planned = i.doseAmount;
    const amt = (f.doses || {})[i.id] ?? (on ? firstAmount(i) : null);
    const changed = on && planned != null && amt != null && (parts > 1 ? amt > planned + 1e-9 : amt !== planned);
    const label = doseLabel(i);
    return (
      <li key={i.id} className={on ? "on" : ""} onClick={() => toggleTaken(i)}>
        <span className="box">{on ? "✓" : ""}</span>
        <span className="rname">
          {i.name}
          {!(on && planned != null) && label ? <span className="muted"> · {label}{parts > 1 ? ` in ${parts} doses` : ""}</span> : null}
          {changed && parts === 1 ? <span className="muted"> · planned {fmtAmt(planned)}</span> : null}
          <TimeChip i={i} />
          {!onSchedule.has(i.id) && <span className="time-chip">extra</span>}
        </span>
        {on && planned != null && <Dots i={i} amt={amt} />}
        {on && planned != null && <Stepper i={i} amt={amt} changed={changed} />}
        {i.status === "testing" && <span className="pill testing">testing</span>}
      </li>
    );
  };
  // Treatments and activities: tap once for done, again for skipped, again to clear.
  const renderState = (i) => {
    const st = stOf(i);
    const done = st === "done" || st === "modified";
    const planned = i.doseAmount;
    const amt = (f.doses || {})[i.id] ?? (done ? firstAmount(i) : null);
    const detail = isActivity(i) ? i.doseNote : doseLabel(i);
    const changed = done && planned != null && amt != null && amt !== planned && partsOf(i) === 1;
    return (
      <li key={i.id} className={done ? "on" : ""} onClick={() => cycleState(i)} title="Tap: done. Tap again: skipped. Again: clear.">
        <StateBox st={st} />
        <span className="rname">
          {i.name}
          {detail && !(done && planned != null) ? <span className="muted"> · {detail}</span> : null}
          {changed ? <span className="muted"> · planned {fmtAmt(planned)}</span> : null}
          <TimeChip i={i} />
          {!onSchedule.has(i.id) && <span className="time-chip">extra</span>}
        </span>
        {st === "skipped" && <span className="pill baseline">skipped</span>}
        {done && planned != null && <Dots i={i} amt={amt} />}
        {done && planned != null && <Stepper i={i} amt={amt} changed={changed} />}
        {i.status === "testing" && <span className="pill testing">testing</span>}
      </li>
    );
  };

  return (
    <>
      <div className="ht-nav">
        <button onClick={() => setDate(addDays(date, -1))}>‹</button>
        <button onClick={() => setDate(addDays(date, 1))}>›</button>
        {date !== today() && <button className="today" onClick={() => setDate(today())}>Today</button>}
        <h2>{fmtLong(date)}</h2>
      </div>
      <div className="ht-day">
        <div className="card">
          <h3>{isLogged ? "How the day went" : "How's today going?"}</h3>
          <Scale label="Energy" value={f.energy} onPick={(n) => set("energy", n)} />
          <Scale label="Inflammation" hint="1 is none, 10 is the worst you get" value={f.inflammation} onPick={(n) => set("inflammation", n)} />
          <Scale label="Mental clarity" hint="1 is fog, 10 is sharp" value={f.clarity} onPick={(n) => set("clarity", n)} />
          <Scale label="Stress" hint="1 is calm, 10 is overwhelmed" value={f.stress} onPick={(n) => set("stress", n)} />
          <div className="ht-row">
            <div className="ht-field">Flare
              <select value={f.flare ? "yes" : "no"} onChange={(e) => set("flare", e.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></select>
            </div>
            {f.flare && <Scale label="How bad" max={5} value={f.severity} onPick={(n) => set("severity", n)} />}
          </div>
          <div className="ht-field">What was different
            <textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} placeholder="New food, hard work, conflict, a great day for no reason. Write as much as you want." />
          </div>
          <div className="day-actions">
            <button className="btn" onClick={submit} disabled={f.energy == null}>{isLogged ? "Update" : "Save today"}</button>
            {existing && !confirmRemove && <button className="ht-link with-icon" onClick={() => setConfirmRemove(true)}><Trash size={13} /> Remove this day</button>}
            {existing && confirmRemove && <span className="confirm">Remove everything logged for this day? <button className="ht-link danger" onClick={removeEntry}>Yes, remove</button><button className="ht-link" onClick={() => setConfirmRemove(false)}>Keep</button></span>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="card">
            <div className="card-head">
              <h3>Food</h3>
              {meals.length > 0 && <span className="hint">{meals.filter((m) => f.meals?.includes(mealKey(m))).length} of {meals.length} planned</span>}
              {!addingMeal && <Repeat items={foodRepeat} />}
              <button className="btn ghost sm" onClick={() => addingMeal ? cancelExtra() : setAddingMeal(true)}>{addingMeal ? "Cancel" : "+ Add"}</button>
            </div>
            {meals.length > 0 && <ul className="check" style={{ marginTop: 8 }}>
              {meals.map((m, i) => { const k = mealKey(m); const on = f.meals?.includes(k); return (
                <li key={i} className={on ? "on" : ""} onClick={() => toggleMeal(k)}>
                  <span className="box">{on ? "✓" : ""}</span>
                  <span style={{ flex: 1 }}>{m.items}</span>
                  <span className="muted" style={{ fontSize: 12, textTransform: "capitalize" }}>{m.meal}</span>
                </li>); })}
            </ul>}
            {(f.extras || []).length > 0 && <ul className="list" style={{ marginTop: 8 }}>
              {f.extras.map((x) => <li key={x.id} className={editingExtra === x.id ? "editing" : ""}>
                <span style={{ flex: 1 }}>{x.items}</span>
                <span className="muted" style={{ fontSize: 12, textTransform: "capitalize" }}>{x.meal}</span>
                <span className="dose-ctl" title="How many servings">
                  <button type="button" onClick={() => bumpExtra(x.id, -1)} disabled={(x.qty || 1) <= 1} aria-label="One fewer">−</button>
                  <span className="amt" style={{ minWidth: 28 }}>×{x.qty || 1}</span>
                  <button type="button" onClick={() => bumpExtra(x.id, 1)} aria-label="One more">+</button>
                </span>
                <button className="ht-link" style={{ padding: "0 6px", fontSize: 12 }} onClick={() => editExtra(x)}>Edit</button>
                <button className="ht-link" style={{ padding: "0 4px", fontSize: 13, lineHeight: 1 }} onClick={() => removeExtra(x.id)} title="Remove">×</button>
              </li>)}
            </ul>}
            {addingMeal && <div className="inline-add">
              <div className="ht-row">
                <div className="ht-field" style={{ flex: 2 }}>What you ate<input list="pw-foods" value={newMeal.items} onChange={(e) => setNewMeal({ ...newMeal, items: e.target.value })} placeholder="Eggs, white rice" autoFocus onKeyDown={(e) => e.key === "Enter" && addExtra()} /></div>
                <datalist id="pw-foods">{indexFoods.map((x) => <option key={x.id} value={x.name} />)}</datalist>
                <div className="ht-field">When<input value={newMeal.meal} onChange={(e) => setNewMeal({ ...newMeal, meal: e.target.value })} placeholder="Lunch" onKeyDown={(e) => e.key === "Enter" && addExtra()} /></div>
              </div>
              <button className="btn sm" onClick={addExtra} style={{ marginBottom: 10 }}>{editingExtra ? "Save changes" : "Log it"}</button>
            </div>}
            {meals.length === 0 && !(f.extras || []).length && !addingMeal && <p className="empty" style={{ marginTop: 8 }}>Nothing logged. Add what you ate, or import a meal plan in Month view to get a checklist here.</p>}
            {meals.length > 0 && <p className="hint" style={{ marginTop: 8 }}>Check what you actually ate. Anything off-plan goes under + Add so the record matches what happened.</p>}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Drinks</h3>
              {!addingDrink && <Repeat items={drinkRepeat} />}
              <button className="btn ghost sm" onClick={() => addingDrink ? cancelDrink() : setAddingDrink(true)}>{addingDrink ? "Cancel" : "+ Add"}</button>
            </div>
            {(f.drinks || []).length > 0 && <ul className="list" style={{ marginTop: 8 }}>
              {f.drinks.map((x) => <li key={x.id} className={editingDrink === x.id ? "editing" : ""}>
                <span style={{ flex: 1 }}>{x.name}{x.size ? <span className="muted"> · {x.size}</span> : null}</span>
                <span className="dose-ctl" title="How many">
                  <button type="button" onClick={() => bumpDrink(x.id, -1)} disabled={(x.qty || 1) <= 1} aria-label="One fewer">−</button>
                  <span className="amt" style={{ minWidth: 28 }}>×{x.qty || 1}</span>
                  <button type="button" onClick={() => bumpDrink(x.id, 1)} aria-label="One more">+</button>
                </span>
                <button className="ht-link" style={{ padding: "0 6px", fontSize: 12 }} onClick={() => editDrink(x)}>Edit</button>
                <button className="ht-link" style={{ padding: "0 4px", fontSize: 13, lineHeight: 1 }} onClick={() => removeDrink(x.id)} title="Remove">×</button>
              </li>)}
            </ul>}
            {addingDrink && <div className="inline-add">
              <div className="ht-row">
                <div className="ht-field" style={{ flex: 2 }}>Drink<input list="pw-drinks" value={newDrink.name} onChange={(e) => onDrinkName(e.target.value)} placeholder="Water, coffee, kombucha" autoFocus onKeyDown={(e) => e.key === "Enter" && submitDrink()} /></div>
                <datalist id="pw-drinks">{indexDrinks.map((x) => <option key={x.id} value={x.name} />)}</datalist>
                <div className="ht-field">Size<input value={newDrink.size} onChange={(e) => setNewDrink({ ...newDrink, size: e.target.value })} placeholder="16 oz" onKeyDown={(e) => e.key === "Enter" && submitDrink()} /></div>
              </div>
              <button className="btn sm" onClick={submitDrink} style={{ marginBottom: 10 }}>{editingDrink ? "Save changes" : "Log it"}</button>
            </div>}
            {!(f.drinks || []).length && !addingDrink && <p className="empty" style={{ marginTop: 8 }}>Nothing logged. Add what you drank — water, coffee, anything — so it can be compared against how you feel.{drinkRepeat.length ? " Repeat brings back recent ones in a tap." : ""}</p>}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Activity</h3>
              {(actScheduled.length + plannedWo.length) > 0 && <span className="hint">{actScheduled.filter(answered).length + plannedWo.filter((w) => (f.woStatus || {})[woKey(w)]).length} of {actScheduled.length + plannedWo.length}</span>}
              {!addingWo && <Repeat items={woRepeat} />}
              <button className="btn ghost sm" onClick={() => addingWo ? closeWo() : (setAddingWo(true), setWoMode(notTodayActs.length ? "" : "new"))}>{addingWo ? "Cancel" : "+ Add"}</button>
            </div>
            {actShown.length > 0 && <ul className="check" style={{ marginTop: 8 }}>{actShown.map(renderState)}</ul>}
            {plannedWo.length > 0 && <ul className="check" style={{ marginTop: 8 }}>
              {plannedWo.map((w, i) => { const k = woKey(w); const st = (f.woStatus || {})[k]; return (
                <li key={i} className={st === "done" || st === "modified" ? "on" : ""} onClick={() => cycleWo(k)} title="Tap: done. Tap again: skipped. Again: clear.">
                  <StateBox st={st} />
                  <span style={{ flex: 1 }}>{w.workout}{w.details ? <span className="muted"> · {w.details}</span> : null}<span className="time-chip">plan</span></span>
                  {st === "skipped" && <span className="pill baseline">skipped</span>}
                </li>); })}
            </ul>}
            {(f.extraWorkouts || []).length > 0 && <ul className="list" style={{ marginTop: 8 }}>
              {f.extraWorkouts.map((x) => <li key={x.id}>
                <span style={{ flex: 1 }}>{x.workout}{[x.details, x.intensity].filter(Boolean).length ? <span className="muted"> · {[x.details, x.intensity].filter(Boolean).join(" · ")}</span> : null}</span>
                <span className="muted" style={{ fontSize: 12 }}>one-off</span>
                <button className="ht-link" style={{ padding: "0 4px", fontSize: 13, lineHeight: 1 }} onClick={() => removeWo(x.id)} title="Remove">×</button>
              </li>)}
            </ul>}
            {addingWo && <div className="inline-add">
              {woMode === "" && <div className="choice">
                <button type="button" className="btn ghost sm" onClick={() => setWoMode("index")}>From your Index</button>
                <button type="button" className="btn ghost sm" onClick={() => setWoMode("new")}>Something new</button>
              </div>}
              {woMode === "index" && <>
                <div className="ht-field">Activity
                  <select value={woPick} onChange={(e) => setWoPick(e.target.value)} autoFocus>
                    <option value="">Choose…</option>
                    {notTodayActs.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </select>
                </div>
                <button className="btn sm" onClick={pickWo} disabled={!woPick} style={{ marginBottom: 10 }}>Add to today</button>
              </>}
              {woMode === "new" && <>
                <div className="ht-row">
                  <div className="ht-field" style={{ flex: 2 }}>What you did<input value={newWo.workout} onChange={(e) => setNewWo({ ...newWo, workout: e.target.value })} placeholder="Walk, lifting, job site" autoFocus onKeyDown={(e) => e.key === "Enter" && (addWo(), closeWo())} /></div>
                  <div className="ht-field">Details<input value={newWo.details} onChange={(e) => setNewWo({ ...newWo, details: e.target.value })} placeholder="25 min, easy" onKeyDown={(e) => e.key === "Enter" && (addWo(), closeWo())} /></div>
                  <div className="ht-field">How hard<select value={newWo.intensity || ""} onChange={(e) => setNewWo({ ...newWo, intensity: e.target.value })}><option value="">—</option>{INTENSITY.map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
                </div>
                <button className="btn sm" onClick={() => { addWo(); closeWo(); }} disabled={!newWo.workout.trim()} style={{ marginBottom: 10 }}>Log it</button>
              </>}
            </div>}
            <div className="ht-row" style={{ marginTop: 12 }}>
              <div className="ht-field" style={{ marginBottom: 4 }}>How hard overall
                <select value={f.activity} onChange={(e) => { const v = e.target.value; setF((p) => ({ ...p, activity: v, activityAuto: false })); }}><option value="">Not set</option>{ACTIVITY.map((a) => <option key={a} value={a}>{a}</option>)}</select>
                {f.activityAuto && f.activity && <span className="hint">Set from what you did — change it if the day was harder overall.</span>}
              </div>
              <div className="ht-field" style={{ flex: 2, marginBottom: 4 }}>Note
                <input value={f.activityNote} onChange={(e) => set("activityNote", e.target.value)} placeholder="Felt fine, or paid for it later" />
              </div>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>{actShown.length || plannedWo.length ? "Tap once for done, twice for skipped. Skipping on a bad day is data, not a miss — and it's recorded differently from leaving it blank." : "Regular activities come from the Index on the days you schedule them. Anything else goes under + Add."}</p>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Today's routine</h3>
              {routine.length > 0 && <span className="hint">{doneCount} of {routine.length}</span>}
              {!addingRoutine && <Repeat items={routineRepeat} />}
              <button className="btn ghost sm" onClick={() => { setAddingRoutine(!addingRoutine); setNewRoutine(blankRoutine); }}>{addingRoutine ? "Cancel" : "+ Add"}</button>
            </div>
            {addingRoutine && <div className="inline-add">
              {newRoutine.mode === "" && <div className="choice">
                <button type="button" className="btn ghost sm" onClick={() => setNewRoutine({ ...newRoutine, mode: "index" })} disabled={!notTodayRoutine.length} title={notTodayRoutine.length ? "" : "Everything in your Index is already on today"}>From your Index</button>
                <button type="button" className="btn ghost sm" onClick={() => setNewRoutine({ ...newRoutine, mode: "new" })}>Something not in the Index</button>
              </div>}
              {newRoutine.mode === "index" && <div className="ht-field">From your Index
                <select value={newRoutine.pick} onChange={(e) => setNewRoutine({ ...newRoutine, pick: e.target.value })} autoFocus>
                  <option value="">Choose…</option>
                  {ROUTINE_KINDS.map((k) => { const opts = notTodayRoutine.filter((i) => kindOf(i) === k); return opts.length ? <optgroup key={k} label={KIND_LABEL[k]}>{opts.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</optgroup> : null; })}
                </select>
              </div>}
              {newRoutine.mode === "new" && <div className="ht-row">
                <div className="ht-field" style={{ flex: 2 }}>Name<input value={newRoutine.name} onChange={(e) => setNewRoutine({ ...newRoutine, name: e.target.value })} placeholder="Ibuprofen, Epsom bath" autoFocus onKeyDown={(e) => e.key === "Enter" && submitRoutine()} /></div>
                <div className="ht-field">Kind<select value={newRoutine.kind} onChange={(e) => setNewRoutine({ ...newRoutine, kind: e.target.value, unit: e.target.value === "treatment" ? "min" : "mg" })}>{ROUTINE_KINDS.map((k) => <option key={k} value={k}>{SINGULAR[k]}</option>)}</select></div>
                <div className="ht-field">{newRoutine.kind === "treatment" ? "How long or how much" : "Amount"}
                  <div className="dose-fields">
                    <input type="number" inputMode="decimal" min="0" step="any" value={newRoutine.amount} onChange={(e) => setNewRoutine({ ...newRoutine, amount: e.target.value })} placeholder={newRoutine.kind === "treatment" ? "20" : "200"} />
                    <select value={newRoutine.unit} onChange={(e) => setNewRoutine({ ...newRoutine, unit: e.target.value })}><option value="">unit</option>{(newRoutine.kind === "treatment" ? [...TIME_UNITS, ...DOSE_UNITS] : DOSE_UNITS).map((u) => <option key={u} value={u}>{u}</option>)}</select>
                  </div>
                </div>
              </div>}
              {newRoutine.mode && <>
                <button className="btn sm" onClick={submitRoutine} disabled={newRoutine.mode === "index" ? !newRoutine.pick : !newRoutine.name.trim()} style={{ marginBottom: 10 }}>Add to today</button>
                <p className="hint" style={{ margin: "-4px 0 8px" }}>Only today changes. To make it a regular thing, add it in the Index with a schedule.</p>
              </>}
            </div>}
            {routineShown.length ? groups.map(([kind, items]) => (
              <div key={kind} className="rgroup">
                {groups.length > 1 && <div className="rgroup-head">{KIND_LABEL[kind]}</div>}
                <ul className="check">{items.map((i) => usesState(i) ? renderState(i) : renderTake(i))}</ul>
              </div>
            )) : !(f.routineExtras || []).length && <p className="empty">Nothing scheduled today. Add supplements, medications, or treatments in the Index and switch them on — or + Add something just for today.</p>}
            {(f.routineExtras || []).length > 0 && <>
              {routineShown.length > 0 && <div className="rgroup-head">Just today</div>}
              <ul className="list" style={{ marginTop: 4 }}>
                {f.routineExtras.map((x) => <li key={x.id}>
                  <span style={{ flex: 1 }}>{x.name}<span className="muted"> · {SINGULAR[x.kind] || x.kind}{x.amount != null ? ` · ${fmtAmt(x.amount)} ${unitFor(x.amount, x.unit)}` : ""}</span></span>
                  <span className="dose-ctl" title="How many times">
                    <button type="button" onClick={() => bumpRoutineExtra(x.id, -1)} disabled={(x.qty || 1) <= 1} aria-label="One fewer">−</button>
                    <span className="amt" style={{ minWidth: 28 }}>×{x.qty || 1}</span>
                    <button type="button" onClick={() => bumpRoutineExtra(x.id, 1)} aria-label="One more">+</button>
                  </span>
                  <button className="ht-link" style={{ padding: "0 4px", fontSize: 13, lineHeight: 1 }} onClick={() => removeRoutineExtra(x.id)} title="Remove">×</button>
                </li>)}
              </ul>
            </>}
            {testingFoods.length > 0 && <ul className="list" style={{ marginTop: 8 }}>
              {testingFoods.map((x) => <li key={x.id}><span>{x.name}</span><span className="pill testing">{x.kind === "drink" ? "drink test" : "food test"}</span></li>)}
            </ul>}
            {routine.length > 0 && <p className="hint" style={{ marginTop: 8 }}>
              {routine.some((i) => !usesState(i)) && "Tap as you take things. Split doses start at one portion — + adds the next. "}
              {routine.some(usesState) && "Treatments: tap once for done, twice for skipped."}
            </p>}
          </div>
        </div>
      </div>
    </>
  );
}
