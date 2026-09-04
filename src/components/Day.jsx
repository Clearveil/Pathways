import { useState, useEffect } from "react";
import { today, addDays, uid, now, ACTIVITY, activeOn, mealKey, woKey, logged, fmtLong } from "../lib/utils.js";
import { Trash } from "./Icons.jsx";

export default function Day({ data, save, date, setDate }) {
  const existing = data.entries.find((e) => e.date === date);
  const [f, setF] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  useEffect(() => { setConfirmRemove(false); }, [date]);
  // Drops the whole entry for this day: ratings, notes, checklists, extras.
  // Plans stay; they belong to the calendar, not the day.
  const removeEntry = () => { setConfirmRemove(false); save({ ...data, entries: data.entries.filter((e) => e.date !== date) }); };
  const [addingMeal, setAddingMeal] = useState(false);
  const [newMeal, setNewMeal] = useState({ meal: "", items: "" });
  const [addingWo, setAddingWo] = useState(false);
  const [newWo, setNewWo] = useState({ workout: "", details: "" });
  useEffect(() => { setF(existing || { date, energy: null, inflammation: null, flare: false, severity: 3, activity: "", activityNote: "", notes: "", taken: [], meals: [], extras: [] }); }, [date, existing]);
  if (!f) return null;
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const submit = () => { if (f.energy == null) return; saveEntry({ ...f, date }); };
  const isLogged = logged(existing);
  const meals = data.meals.filter((m) => m.date === date);
  const active = activeOn(data, date);
  const regimen = active.filter((i) => i.type !== "lifestyle");
  const lifestyle = active.filter((i) => i.type === "lifestyle");
  const saveEntry = (next) => { const row = { ...next, id: next.id || uid(), updatedAt: now() }; setF(row); save({ ...data, entries: [...data.entries.filter((e) => e.date !== date), row].sort((a, b) => a.date.localeCompare(b.date)) }); };
  const toggleMeal = (k) => saveEntry({ ...f, date, meals: f.meals?.includes(k) ? f.meals.filter((x) => x !== k) : [...(f.meals || []), k] });
  const addExtra = () => {
    if (!newMeal.items.trim()) return;
    saveEntry({ ...f, date, extras: [...(f.extras || []), { id: uid(), meal: newMeal.meal.trim() || "meal", items: newMeal.items.trim() }] });
    setNewMeal({ meal: "", items: "" }); setAddingMeal(false);
  };
  const removeExtra = (id) => saveEntry({ ...f, date, extras: (f.extras || []).filter((x) => x.id !== id) });
  const plannedWo = (data.workouts || []).filter((w) => w.date === date);
  const cycleWo = (k) => {
    const order = [undefined, "done", "modified", "skipped"];
    const cur = (f.woStatus || {})[k];
    const nx = order[(order.indexOf(cur) + 1) % order.length];
    const woStatus = { ...(f.woStatus || {}) };
    if (nx) woStatus[k] = nx; else delete woStatus[k];
    saveEntry({ ...f, date, woStatus });
  };
  const addWo = () => {
    if (!newWo.workout.trim()) return;
    saveEntry({ ...f, date, extraWorkouts: [...(f.extraWorkouts || []), { id: uid(), workout: newWo.workout.trim(), details: newWo.details.trim() }] });
    setNewWo({ workout: "", details: "" }); setAddingWo(false);
  };
  const removeWo = (id) => saveEntry({ ...f, date, extraWorkouts: (f.extraWorkouts || []).filter((x) => x.id !== id) });
  const toggleTaken = (id) => {
    const taken = f.taken?.includes(id) ? f.taken.filter((x) => x !== id) : [...(f.taken || []), id];
    saveEntry({ ...f, taken, date });
  };
  const testing = data.foods.filter((x) => x.status === "testing");

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
          <div className="ht-field">Energy
            <div className="scale">{[1,2,3,4,5,6,7,8,9,10].map((n) => <button key={n} className={f.energy === n ? "on" : ""} onClick={() => set("energy", n)}>{n}</button>)}</div>
          </div>
          <div className="ht-field">Inflammation <span className="hint" style={{ marginTop: -4 }}>1 is none, 10 is the worst you get</span>
            <div className="scale">{[1,2,3,4,5,6,7,8,9,10].map((n) => <button key={n} className={f.inflammation === n ? "on" : ""} onClick={() => set("inflammation", n)}>{n}</button>)}</div>
          </div>
          <div className="ht-row">
            <div className="ht-field">Flare
              <select value={f.flare ? "yes" : "no"} onChange={(e) => set("flare", e.target.value === "yes")}><option value="no">No</option><option value="yes">Yes</option></select>
            </div>
            {f.flare && <div className="ht-field">How bad
              <div className="scale">{[1,2,3,4,5].map((n) => <button key={n} className={f.severity === n ? "on" : ""} onClick={() => set("severity", n)}>{n}</button>)}</div>
            </div>}
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
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ flex: 1, marginBottom: 0 }}>Food</h3>
              {meals.length > 0 && <span className="hint">{meals.filter((m) => f.meals?.includes(mealKey(m))).length} of {meals.length} planned</span>}
              <button className="btn ghost sm" onClick={() => setAddingMeal(!addingMeal)}>{addingMeal ? "Cancel" : "+ Add"}</button>
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
              {f.extras.map((x) => <li key={x.id}>
                <span style={{ flex: 1 }}>{x.items}</span>
                <span className="muted" style={{ fontSize: 12, textTransform: "capitalize" }}>{x.meal}</span>
                <button className="ht-link" style={{ padding: "0 4px", fontSize: 13, lineHeight: 1 }} onClick={() => removeExtra(x.id)} title="Remove">×</button>
              </li>)}
            </ul>}
            {addingMeal && <div style={{ background: "var(--bg2)", borderRadius: 10, padding: "10px 12px 2px", marginTop: 10 }}>
              <div className="ht-row">
                <div className="ht-field" style={{ flex: 2 }}>What you ate<input value={newMeal.items} onChange={(e) => setNewMeal({ ...newMeal, items: e.target.value })} placeholder="Eggs, white rice" autoFocus onKeyDown={(e) => e.key === "Enter" && addExtra()} /></div>
                <div className="ht-field">When<input value={newMeal.meal} onChange={(e) => setNewMeal({ ...newMeal, meal: e.target.value })} placeholder="Lunch" onKeyDown={(e) => e.key === "Enter" && addExtra()} /></div>
              </div>
              <button className="btn sm" onClick={addExtra} style={{ marginBottom: 10 }}>Log it</button>
            </div>}
            {meals.length === 0 && !(f.extras || []).length && !addingMeal && <p className="empty" style={{ marginTop: 8 }}>Nothing logged. Add what you ate, or import a meal plan in Month view to get a checklist here.</p>}
            {meals.length > 0 && <p className="hint" style={{ marginTop: 8 }}>Check what you actually ate. Anything off-plan goes under + Add so the record matches what happened.</p>}
          </div>
          <div className="card">
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h3 style={{ flex: 1, marginBottom: 0 }}>Activity</h3>
              {plannedWo.length > 0 && <span className="hint">{plannedWo.filter((w) => (f.woStatus || {})[woKey(w)]).length} of {plannedWo.length} answered</span>}
              <button className="btn ghost sm" onClick={() => setAddingWo(!addingWo)}>{addingWo ? "Cancel" : "+ Add"}</button>
            </div>
            {plannedWo.length > 0 && <ul className="check" style={{ marginTop: 8 }}>
              {plannedWo.map((w, i) => { const k = woKey(w); const st = (f.woStatus || {})[k]; return (
                <li key={i} className={st === "done" ? "on" : ""} onClick={() => cycleWo(k)} title="Tap to cycle: done, modified, skipped">
                  <span className={"box" + (st === "skipped" ? " skip" : st === "modified" ? " mod" : "")}>{st === "done" ? "✓" : st === "modified" ? "~" : st === "skipped" ? "–" : ""}</span>
                  <span style={{ flex: 1 }}>{w.workout}{w.details ? <span className="muted"> · {w.details}</span> : null}</span>
                  {st && st !== "done" && <span className={"pill " + (st === "skipped" ? "not-tolerated" : "testing")}>{st}</span>}
                </li>); })}
            </ul>}
            {(f.extraWorkouts || []).length > 0 && <ul className="list" style={{ marginTop: 8 }}>
              {f.extraWorkouts.map((x) => <li key={x.id}>
                <span style={{ flex: 1 }}>{x.workout}{x.details ? <span className="muted"> · {x.details}</span> : null}</span>
                <span className="muted" style={{ fontSize: 12 }}>{plannedWo.length ? "off plan" : ""}</span>
                <button className="ht-link" style={{ padding: "0 4px", fontSize: 13, lineHeight: 1 }} onClick={() => removeWo(x.id)} title="Remove">×</button>
              </li>)}
            </ul>}
            {addingWo && <div style={{ background: "var(--bg2)", borderRadius: 10, padding: "10px 12px 2px", marginTop: 10 }}>
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
            <p className="hint" style={{ marginTop: 8 }}>{plannedWo.length ? "Tap a planned workout to mark it done, modified, or skipped. Skipping on a bad day is data, not a miss." : "Log what you actually did. The overall rating saves with the entry."}</p>
          </div>
          <div className="card">
            <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
              <h3 style={{ flex: 1 }}>Today's regimen</h3>
              {regimen.length > 0 && <span className="hint">{regimen.filter((i) => f.taken?.includes(i.id)).length} of {regimen.length}</span>}
            </div>
            {regimen.length ? <ul className="check">
              {regimen.map((i) => { const on = f.taken?.includes(i.id); return (
                <li key={i.id} className={on ? "on" : ""} onClick={() => toggleTaken(i.id)}>
                  <span className="box">{on ? "✓" : ""}</span>
                  <span style={{ flex: 1 }}>{i.name}{i.dose ? <span className="muted"> · {i.dose}</span> : null}</span>
                  {i.status === "testing" && <span className="pill testing">testing</span>}
                </li>); })}
            </ul> : <p className="empty">Nothing on the regimen for this day. Add what you take under Foods & supplements and switch it on.</p>}
            {(lifestyle.length > 0 || testing.length > 0) && <ul className="list" style={{ marginTop: 8 }}>
              {lifestyle.map((i) => <li key={i.id}><span>{i.name}</span><span className={`pill ${i.status}`}>{i.status}</span></li>)}
              {testing.map((x) => <li key={x.id}><span>{x.name}</span><span className="pill testing">food test</span></li>)}
            </ul>}
            {regimen.length > 0 && <p className="hint" style={{ marginTop: 8 }}>Checks save instantly — tap as you take them.</p>}
          </div>
        </div>
      </div>
    </>
  );
}

