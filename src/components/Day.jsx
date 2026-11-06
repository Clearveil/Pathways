import { useState, useEffect } from "react";
import { today, addDays, uid, now, ACTIVITY, INT_TYPE, KIND_LABEL, activeOn, isActivity, mealKey, woKey, logged, fmtLong, fmtTime } from "../lib/utils.js";
import { Trash } from "./Icons.jsx";
import { doseLabel, doseStep, fmtAmt, partsOf, portionOf } from "../lib/dose.js";

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
const NEXT_STATE = { undefined: "done", done: "modified", modified: "skipped", skipped: undefined };
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
  useEffect(() => { setConfirmRemove(false); }, [date]);
  useEffect(() => { setF(existing || { date, energy: null, inflammation: null, clarity: null, stress: null, flare: false, severity: 3, activity: "", activityNote: "", notes: "", taken: [], doses: {}, meals: [], extras: [], drinks: [], activityStatus: {} }); }, [date, existing]);
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
  // One-tap re-add of drinks from the last month that aren't on today yet.
  const todayKeys = new Set((f.drinks || []).map(drinkKey));
  const recentDrinks = [];
  [...data.entries].filter((e) => e.date !== date && e.date >= addDays(date, -30)).sort((a, b) => b.date.localeCompare(a.date))
    .forEach((e) => (e.drinks || []).forEach((d) => { const k = drinkKey(d); if (!todayKeys.has(k) && !recentDrinks.some((r) => drinkKey(r) === k) && recentDrinks.length < 6) recentDrinks.push(d); }));

  // ---- Activity (planned workouts and one-offs) ---------------------------
  const plannedWo = (data.workouts || []).filter((w) => w.date === date);
  const cycleWo = (k) => {
    const woStatus = { ...(f.woStatus || {}) };
    const nx = NEXT_STATE[woStatus[k]];
    if (nx) woStatus[k] = nx; else delete woStatus[k];
    saveEntry({ ...f, date, woStatus });
  };
  const addWo = () => {
    if (!newWo.workout.trim()) return;
    saveEntry({ ...f, date, extraWorkouts: [...(f.extraWorkouts || []), { id: uid(), workout: newWo.workout.trim(), details: newWo.details.trim() }] });
    setNewWo({ workout: "", details: "" }); setAddingWo(false);
  };
  const removeWo = (id) => saveEntry({ ...f, date, extraWorkouts: (f.extraWorkouts || []).filter((x) => x.id !== id) });

  // ---- Routine -----------------------------------------------------------
  // Everything in the Index that's switched on and scheduled for this
  // weekday. Things you take are checked off with an amount; split doses
  // start at one portion and + adds the next. Activities are three-state.
  const routine = activeOn(data, date).sort((a, b) => ((a.times || []).find(Boolean) || "99").localeCompare((b.times || []).find(Boolean) || "99") || a.name.localeCompare(b.name));
  const groups = INT_TYPE.map((k) => [k, routine.filter((i) => (isActivity(i) ? "activity" : i.type) === k)]).filter(([, items]) => items.length);
  const takeItems = routine.filter((i) => !isActivity(i));
  const actItems = routine.filter(isActivity);
  const doneCount = takeItems.filter((i) => f.taken?.includes(i.id)).length + actItems.filter((i) => (f.activityStatus || {})[i.id]).length;
  const firstAmount = (i) => partsOf(i) > 1 ? portionOf(i) : i.doseAmount;
  const stepFor = (i) => partsOf(i) > 1 ? portionOf(i) : doseStep(i.doseAmount, i.doseUnit);
  const toggleTaken = (i) => {
    const on = f.taken?.includes(i.id);
    const taken = on ? f.taken.filter((x) => x !== i.id) : [...(f.taken || []), i.id];
    const doses = { ...(f.doses || {}) };
    if (on) delete doses[i.id]; else if (i.doseAmount != null) doses[i.id] = firstAmount(i);
    saveEntry({ ...f, taken, doses, date });
  };
  const adjustDose = (i, delta) => {
    const doses = { ...(f.doses || {}) };
    const cur = doses[i.id] ?? firstAmount(i) ?? 0;
    const next = Math.max(0, Math.round((cur + delta) * 100) / 100);
    if (next === 0) return toggleTaken(i);
    doses[i.id] = next;
    saveEntry({ ...f, taken: f.taken?.includes(i.id) ? f.taken : [...(f.taken || []), i.id], doses, date });
  };
  const cycleActivity = (i) => {
    const activityStatus = { ...(f.activityStatus || {}) };
    const nx = NEXT_STATE[activityStatus[i.id]];
    if (nx) activityStatus[i.id] = nx; else delete activityStatus[i.id];
    saveEntry({ ...f, date, activityStatus });
  };
  const testingFoods = data.foods.filter((x) => x.status === "testing");

  const renderTake = (i) => {
    const on = f.taken?.includes(i.id);
    const parts = partsOf(i);
    const planned = i.doseAmount;
    const amt = (f.doses || {})[i.id] ?? (on ? firstAmount(i) : null);
    const portion = portionOf(i);
    const k = parts > 1 && portion ? Math.round((amt / portion) * 10) / 10 : null;
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
        </span>
        {on && planned != null && (
          <span className="dose-ctl" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => adjustDose(i, -stepFor(i))} aria-label="Less">−</button>
            <span className={"amt" + (changed ? " changed" : "")}>{fmtAmt(amt)} {i.doseUnit}{k != null && Number.isInteger(k) ? <small> {k}/{parts}</small> : null}</span>
            <button type="button" onClick={() => adjustDose(i, stepFor(i))} aria-label="More">+</button>
          </span>
        )}
        {i.status === "testing" && <span className="pill testing">testing</span>}
      </li>
    );
  };
  const renderActivity = (i) => {
    const st = (f.activityStatus || {})[i.id];
    return (
      <li key={i.id} className={st === "done" ? "on" : ""} onClick={() => cycleActivity(i)} title="Tap to cycle: done, modified, skipped">
        <StateBox st={st} />
        <span className="rname">{i.name}{i.doseNote ? <span className="muted"> · {i.doseNote}</span> : null}<TimeChip i={i} /></span>
        {st && st !== "done" && <span className={"pill " + (st === "skipped" ? "baseline" : "testing")}>{st}</span>}
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
                <div className="ht-field" style={{ flex: 2 }}>What you ate<input value={newMeal.items} onChange={(e) => setNewMeal({ ...newMeal, items: e.target.value })} placeholder="Eggs, white rice" autoFocus onKeyDown={(e) => e.key === "Enter" && addExtra()} /></div>
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
                <div className="ht-field" style={{ flex: 2 }}>Drink<input value={newDrink.name} onChange={(e) => setNewDrink({ ...newDrink, name: e.target.value })} placeholder="Water, coffee, kombucha" autoFocus onKeyDown={(e) => e.key === "Enter" && submitDrink()} /></div>
                <div className="ht-field">Size<input value={newDrink.size} onChange={(e) => setNewDrink({ ...newDrink, size: e.target.value })} placeholder="16 oz" onKeyDown={(e) => e.key === "Enter" && submitDrink()} /></div>
              </div>
              <button className="btn sm" onClick={submitDrink} style={{ marginBottom: 10 }}>{editingDrink ? "Save changes" : "Log it"}</button>
            </div>}
            {recentDrinks.length > 0 && !addingDrink && <div className="chips">
              {recentDrinks.map((d) => <button key={drinkKey(d)} type="button" className="chip" onClick={() => putDrink(d)}>+ {d.name}{d.size ? ` · ${d.size}` : ""}</button>)}
            </div>}
            {!(f.drinks || []).length && !addingDrink && !recentDrinks.length && <p className="empty" style={{ marginTop: 8 }}>Nothing logged. Add what you drank — water, coffee, anything — so it can be compared against how you feel.</p>}
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Activity</h3>
              {plannedWo.length > 0 && <span className="hint">{plannedWo.filter((w) => (f.woStatus || {})[woKey(w)]).length} of {plannedWo.length} answered</span>}
              <button className="btn ghost sm" onClick={() => setAddingWo(!addingWo)}>{addingWo ? "Cancel" : "+ Add"}</button>
            </div>
            {plannedWo.length > 0 && <ul className="check" style={{ marginTop: 8 }}>
              {plannedWo.map((w, i) => { const k = woKey(w); const st = (f.woStatus || {})[k]; return (
                <li key={i} className={st === "done" ? "on" : ""} onClick={() => cycleWo(k)} title="Tap to cycle: done, modified, skipped">
                  <StateBox st={st} />
                  <span style={{ flex: 1 }}>{w.workout}{w.details ? <span className="muted"> · {w.details}</span> : null}</span>
                  {st && st !== "done" && <span className={"pill " + (st === "skipped" ? "baseline" : "testing")}>{st}</span>}
                </li>); })}
            </ul>}
            {(f.extraWorkouts || []).length > 0 && <ul className="list" style={{ marginTop: 8 }}>
              {f.extraWorkouts.map((x) => <li key={x.id}>
                <span style={{ flex: 1 }}>{x.workout}{x.details ? <span className="muted"> · {x.details}</span> : null}</span>
                <span className="muted" style={{ fontSize: 12 }}>{plannedWo.length ? "off plan" : ""}</span>
                <button className="ht-link" style={{ padding: "0 4px", fontSize: 13, lineHeight: 1 }} onClick={() => removeWo(x.id)} title="Remove">×</button>
              </li>)}
            </ul>}
            {addingWo && <div className="inline-add">
              <div className="ht-row">
                <div className="ht-field" style={{ flex: 2 }}>What you did<input value={newWo.workout} onChange={(e) => setNewWo({ ...newWo, workout: e.target.value })} placeholder="Walk, lifting, job site" autoFocus onKeyDown={(e) => e.key === "Enter" && addWo()} /></div>
                <div className="ht-field">Details<input value={newWo.details} onChange={(e) => setNewWo({ ...newWo, details: e.target.value })} placeholder="25 min, easy" onKeyDown={(e) => e.key === "Enter" && addWo()} /></div>
              </div>
              <button className="btn sm" onClick={addWo} style={{ marginBottom: 10 }}>Log it</button>
            </div>}
            <div className="ht-row" style={{ marginTop: plannedWo.length || (f.extraWorkouts || []).length || addingWo ? 12 : 8 }}>
              <div className="ht-field" style={{ marginBottom: 4 }}>How hard overall
                <select value={f.activity} onChange={(e) => set("activity", e.target.value)}><option value="">Not set</option>{ACTIVITY.map((a) => <option key={a} value={a}>{a}</option>)}</select>
              </div>
              <div className="ht-field" style={{ flex: 2, marginBottom: 4 }}>Note
                <input value={f.activityNote} onChange={(e) => set("activityNote", e.target.value)} placeholder="Felt fine, or paid for it later" />
              </div>
            </div>
            <p className="hint" style={{ marginTop: 8 }}>{plannedWo.length ? "Tap a planned workout to mark it done, modified, or skipped. Skipping on a bad day is data, not a miss." : "One-off activity goes here. Regular activities live in the Index and show up in today's routine."}</p>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Today's routine</h3>
              {routine.length > 0 && <span className="hint">{doneCount} of {routine.length}</span>}
            </div>
            {routine.length ? groups.map(([kind, items]) => (
              <div key={kind} className="rgroup">
                {groups.length > 1 && <div className="rgroup-head">{KIND_LABEL[kind]}</div>}
                <ul className="check">{items.map((i) => isActivity(i) ? renderActivity(i) : renderTake(i))}</ul>
              </div>
            )) : <p className="empty">Nothing scheduled today. Add supplements, medications, treatments, or activities in the Index and switch them on.</p>}
            {testingFoods.length > 0 && <ul className="list" style={{ marginTop: 8 }}>
              {testingFoods.map((x) => <li key={x.id}><span>{x.name}</span><span className="pill testing">food test</span></li>)}
            </ul>}
            {routine.length > 0 && <p className="hint" style={{ marginTop: 8 }}>
              {takeItems.length > 0 && "Tap as you take things. Split doses start at one portion — + adds the next. "}
              {actItems.length > 0 && "Tap an activity to cycle done, modified, skipped. Skipping on a bad day is data, not a miss."}
            </p>}
          </div>
        </div>
      </div>
    </>
  );
}
