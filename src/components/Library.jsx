import { useState } from "react";
import { now } from "../lib/utils.js";
import { today, addDays, uid, FOOD_STATUS, CONFIDENCE, INT_TYPE, INT_STATUS, KIND_LABEL, DAY_SHORT, isOn, isActivity, scheduleLabel } from "../lib/utils.js";
import { useNarrow } from "../lib/useNarrow.js";
import { DOSE_UNITS, TIME_UNITS, doseLabel, partsOf } from "../lib/dose.js";

// The Index is where everything is defined once: what it is, how much, how
// it's taken, and when. The switch puts it on the routine; the Day view then
// shows whatever is on and scheduled for that day.
const EMPTY_HINT = {
  supplement: "Add everything you currently take as baseline first, so the trends chart has context.",
  medication: "Prescriptions and over-the-counter meds. Same rules: one change at a time.",
  treatment: "Sauna, IV, acupuncture, red light, anything done to you or for you on a schedule.",
  activity: "Walks, workouts, stretching, cold plunges. Scheduled here, they appear in today's routine without importing a plan.",
};
const SINGULAR = { supplement: "supplement", medication: "medication", treatment: "treatment", activity: "activity" };

export default function Library({ data, save, openWindow }) {
  return (
    <div className="lib">
      {INT_TYPE.map((kind) => <Interventions key={kind} kind={kind} data={data} save={save} openWindow={openWindow} />)}
      <Foods kind="food" data={data} save={save} openWindow={openWindow} />
      <Foods kind="drink" data={data} save={save} openWindow={openWindow} />
    </div>
  );
}

// One expandable row for phones: a compact line (name, summary, status) that
// opens into the full labelled detail.
function CompactRow({ off, lead, name, sub, pill, kv, actions }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={"lrow" + (open ? " open" : "") + (off ? " off" : "")}>
      <div className="lrow-head" onClick={() => setOpen((o) => !o)} role="button" aria-expanded={open}>
        {lead && <span onClick={(e) => e.stopPropagation()}>{lead}</span>}
        <span className="lrow-main"><span className="lrow-name">{name}</span><span className="lrow-sub">{sub}</span></span>
        {pill}
      </div>
      {open && (
        <div className="lrow-body">
          {kv.map(([k, v]) => <div className="kv" key={k}><b>{k}</b><span>{v}</span></div>)}
          <div className="lrow-actions">{actions}</div>
        </div>
      )}
    </div>
  );
}

// Removed items, kept for history. Restore brings one back; items that
// were never logged can be deleted for good.
function Archived({ items, onRestore, onDelete, hasHistory }) {
  const [open, setOpen] = useState(false);
  if (!items.length) return null;
  return (
    <div className="archived">
      <button type="button" className="ht-link" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"} removed ({items.length})</button>
      {open && <ul className="list">
        {items.map((x) => <li key={x.id}>
          <span style={{ flex: 1, color: "var(--mute)" }}>{x.name}</span>
          <button className="ht-link" onClick={() => onRestore(x.id)}>Restore</button>
          {!hasHistory(x) && <button className="ht-link" onClick={() => onDelete(x.id)} title="Never logged, so nothing is lost">Delete for good</button>}
        </li>)}
      </ul>}
      {open && <p className="hint" style={{ margin: "4px 0 0" }}>Removed items stay in your history, insights and reports. Only things you never logged can be deleted for good.</p>}
    </div>
  );
}

// Weekday picker. All seven lit means every day (stored as null).
function DayPicker({ days, onChange }) {
  const on = (n) => !days || days.includes(n);
  const toggle = (n) => {
    const cur = days || [0, 1, 2, 3, 4, 5, 6];
    const next = cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n].sort();
    onChange(next.length === 7 || next.length === 0 ? null : next);
  };
  return (
    <div className="daypick">
      {DAY_SHORT.map((d, n) => <button key={n} type="button" className={on(n) ? "on" : ""} onClick={() => toggle(n)} aria-pressed={on(n)}>{d}</button>)}
    </div>
  );
}

function Interventions({ kind, data, save, openWindow }) {
  const act = kind === "activity";
  const blank = { name: "", type: kind, intensity: kind === "activity" ? "moderate" : "", measure: kind === "treatment" ? "time" : "dose", doseAmount: "", doseUnit: act ? "" : kind === "treatment" ? "min" : "mg", doseNote: "", dosesPerDay: 1, days: null, times: [], start: today(), end: "", source: "", status: "baseline" };
  const narrow = useNarrow();
  const [f, setF] = useState(blank);
  const [warn, setWarn] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const [doseChange, setDoseChange] = useState(null); // { patch, from, to } awaiting "test or just update?"
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const block = () => setWarn(`${openWindow.name} is already being tested. One open test at a time — otherwise you won't know which change did what.`);
  const closeForm = () => { setF(blank); setEditing(null); setAdding(false); setDoseChange(null); };
  const startEdit = (x) => {
    setF({ name: x.name, type: isActivity(x) ? "activity" : x.type, intensity: x.intensity || "", measure: TIME_UNITS.includes(x.doseUnit) ? "time" : "dose", doseAmount: x.doseAmount ?? "", doseUnit: x.doseUnit || "", doseNote: x.doseNote || "", dosesPerDay: x.dosesPerDay || 1, days: x.days || null, times: x.times || [], start: x.start || "", end: x.end || "", source: x.source || "", status: x.status });
    setEditing(x.id); setAdding(true); setWarn(""); setDoseChange(null);
  };
  const applyEdit = (patch) => { save({ ...data, interventions: data.interventions.map((x) => x.id === editing ? { ...x, ...patch } : x) }); closeForm(); };
  const submit = () => {
    if (!f.name.trim()) return;
    const cur = editing ? data.interventions.find((x) => x.id === editing) : null;
    if (f.status === "testing" && openWindow && cur?.status !== "testing") return block();
    setWarn("");
    const { measure, ...rest } = f;
    const timed = f.type === "treatment" && measure === "time";
    const patch = { ...rest, doseAmount: f.doseAmount === "" ? null : Number(f.doseAmount), dosesPerDay: timed ? 1 : f.dosesPerDay, times: (f.times || []).slice(0, f.type === "activity" || timed ? 1 : f.dosesPerDay) };
    patch.dose = doseLabel(patch);
    if (!editing) { save({ ...data, interventions: [...data.interventions, { ...patch, outcome: "", id: uid() }] }); closeForm(); return; }
    // A dose change is a change. Offer to make it a test window rather than
    // letting it slip in silently beside whatever else is going on.
    const amountChanged = cur?.doseAmount != null && patch.doseAmount != null && patch.doseAmount !== cur.doseAmount;
    if (amountChanged && cur.status !== "testing" && patch.status !== "testing") { setDoseChange({ patch, from: doseLabel(cur), to: doseLabel(patch) }); return; }
    applyEdit(patch);
  };
  const startDoseTest = () => {
    if (openWindow) return block();
    applyEdit({ ...doseChange.patch, status: "testing", start: today(), end: "" });
  };
  const update = (id, patch) => {
    const cur = data.interventions.find((x) => x.id === id);
    if (patch.status === "testing" && openWindow && cur?.status !== "testing") return block();
    setWarn("");
    save({ ...data, interventions: data.interventions.map((x) => x.id === id ? { ...x, ...patch } : x) });
  };
  // Remove never deletes: it stops the item (end date yesterday, if it was
  // running) and archives it, so past days keep its name and insights keep
  // its history. Only items never logged can be deleted outright.
  const remove = (id) => save({ ...data, interventions: data.interventions.map((x) => x.id !== id ? x : { ...x, archivedAt: now(), end: x.end || (x.start && x.start <= addDays(today(), -1) ? addDays(today(), -1) : x.end) }) });
  const restore = (id) => save({ ...data, interventions: data.interventions.map((x) => x.id === id ? { ...x, archivedAt: "" } : x) });
  const hasHistory = (x) => data.entries.some((e) => e.taken?.includes(x.id) || (e.doses || {})[x.id] != null || (e.activityStatus || {})[x.id]);
  const purge = (id) => save({ ...data, interventions: data.interventions.filter((x) => x.id !== id) });
  const order = { testing: 0, baseline: 1, established: 2, discontinued: 3 };
  const ofKind = data.interventions.filter((x) => (isActivity(x) ? "activity" : x.type) === kind);
  const mine = ofKind.filter((x) => !x.archivedAt), archived = ofKind.filter((x) => x.archivedAt);
  const sorted = [...mine].sort((a, b) => (isOn(b) - isOn(a)) || order[a.status] - order[b.status] || (b.start || "").localeCompare(a.start || ""));
  const toggleOn = (x) => {
    if (isOn(x)) update(x.id, { end: addDays(today(), -1) });
    else update(x.id, { end: "", start: x.start || today(), status: x.status === "discontinued" ? "baseline" : x.status });
  };
  const onCount = mine.filter(isOn).length;
  const amountText = (x) => act ? ([x.doseNote, x.intensity].filter(Boolean).join(" · ") || "—") : TIME_UNITS.includes(x.doseUnit) ? (doseLabel(x) || "—") : (doseLabel(x) ? `${doseLabel(x)}${partsOf(x) > 1 ? ` · in ${partsOf(x)} doses` : ""}` : "—");
  const onSwitch = (x) => <button className={"switch" + (isOn(x) ? " on" : "")} onClick={() => toggleOn(x)} title={isOn(x) ? "On the routine — switch off" : "Off the routine — switch on"} />;
  const statusSelect = (x) => <select value={x.status} onChange={(e) => update(x.id, { status: e.target.value })} className={`pill ${x.status}`}>{INT_STATUS.map((s) => <option key={s}>{s}</option>)}</select>;
  const endInput = (x) => <input type="date" value={x.end || ""} onChange={(e) => update(x.id, { end: e.target.value })} style={{ width: 118 }} />;
  const outcomeInput = (x) => <input value={x.outcome || ""} onChange={(e) => update(x.id, { outcome: e.target.value })} placeholder="What happened" style={{ width: 130 }} />;
  const actions = (x) => <><button className="ht-link" onClick={() => startEdit(x)}>Edit</button><button className="ht-link" onClick={() => remove(x.id)} title="Takes it off your Index. Its history is kept.">Remove</button></>;
  const formAct = f.type === "activity";
  const formTimed = f.type === "treatment" && f.measure === "time";
  const timeSlots = formAct || formTimed ? 1 : Math.max(1, f.dosesPerDay || 1);
  const setMeasure = (m) => setF((p) => ({ ...p, measure: m, doseUnit: m === "time" ? "min" : "mg", dosesPerDay: m === "time" ? 1 : p.dosesPerDay }));

  return (
    <div className="card">
      <div className="card-head">
        <h3>{KIND_LABEL[kind]} {mine.length > 0 && <span className="hint" style={{ fontWeight: 400 }}>· {onCount} on</span>}</h3>
        <button className="btn ghost sm" onClick={() => adding ? closeForm() : setAdding(true)}>{adding ? "Cancel" : "Add"}</button>
      </div>
      {warn && <p className="warn">{warn}</p>}
      {adding && <div className="addform">
        {editing && <p className="hint" style={{ margin: "0 0 8px" }}>Editing <b>{data.interventions.find((x) => x.id === editing)?.name}</b></p>}
        <div className="ht-row">
          <div className="ht-field">Name<input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={formAct ? "Morning walk" : kind === "medication" ? "Low-dose naltrexone" : kind === "treatment" ? "Infrared sauna" : "Magnesium glycinate"} autoFocus /></div>
          {editing && <div className="ht-field">Section<select value={f.type} onChange={(e) => set("type", e.target.value)}>{INT_TYPE.map((s) => <option key={s} value={s}>{KIND_LABEL[s]}</option>)}</select></div>}
          {formAct ? <>
            <div className="ht-field" style={{ flex: 2 }}>Details<input value={f.doseNote} onChange={(e) => set("doseNote", e.target.value)} placeholder="30 min, easy pace" /></div>
            <div className="ht-field">How hard
              <select value={f.intensity || "moderate"} onChange={(e) => set("intensity", e.target.value)}>
                <option value="light">Light</option>
                <option value="moderate">Moderate</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </> : <>
            {f.type === "treatment" && <div className="ht-field">Measured by
              <select value={f.measure} onChange={(e) => setMeasure(e.target.value)}>
                <option value="time">Length of time</option>
                <option value="dose">Dose</option>
              </select>
            </div>}
            <div className="ht-field">{formTimed ? "Length" : "Dose"}
              <div className="dose-fields">
                <input type="number" inputMode="decimal" min="0" step="any" value={f.doseAmount} onChange={(e) => set("doseAmount", e.target.value)} placeholder={formTimed ? "20" : "200"} />
                <select value={f.doseUnit} onChange={(e) => set("doseUnit", e.target.value)}>{formTimed ? TIME_UNITS.map((u) => <option key={u} value={u}>{u === "min" ? "minutes" : "hours"}</option>) : <><option value="">unit</option>{[...DOSE_UNITS, ...(f.doseUnit && !DOSE_UNITS.includes(f.doseUnit) && !TIME_UNITS.includes(f.doseUnit) ? [f.doseUnit] : [])].map((u) => <option key={u} value={u}>{u}</option>)}</>}</select>
              </div>
            </div>
            {!formTimed && <div className="ht-field">How it's taken
              <select value={f.dosesPerDay} onChange={(e) => set("dosesPerDay", Number(e.target.value))}>
                <option value={1}>All at once</option>
                {[2, 3, 4].map((n) => <option key={n} value={n}>Split into {n} doses</option>)}
              </select>
            </div>}
          </>}
        </div>
        <div className="ht-row">
          <div className="ht-field" style={{ minWidth: 260 }}>Days<DayPicker days={f.days} onChange={(d) => set("days", d)} /></div>
          <div className="ht-field">{timeSlots > 1 ? "Times (optional)" : "Time (optional)"}
            <div className="time-fields">
              {Array.from({ length: timeSlots }, (_, k) => (
                <input key={k} type="time" value={(f.times || [])[k] || ""} onChange={(e) => { const t = [...(f.times || [])]; t[k] = e.target.value; set("times", t); }} />
              ))}
            </div>
          </div>
        </div>
        <div className="ht-row">
          {!formAct && <div className="ht-field">{formTimed ? "Note" : "Dose note"}<input value={f.doseNote} onChange={(e) => set("doseNote", e.target.value)} placeholder={formTimed ? "140°F, evening" : "with food"} /></div>}
          <div className="ht-field">Recommended by<input value={f.source} onChange={(e) => set("source", e.target.value)} placeholder="Practitioner, book, self" /></div>
        </div>
        <div className="ht-row">
          <div className="ht-field">Start<input type="date" value={f.start} onChange={(e) => set("start", e.target.value)} /></div>
          <div className="ht-field">End<input type="date" value={f.end} onChange={(e) => set("end", e.target.value)} /></div>
          <div className="ht-field">Status<select value={f.status} onChange={(e) => set("status", e.target.value)}>{INT_STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <p className="hint" style={{ margin: "-6px 0 10px" }}>Baseline: already doing it, not changing. Testing: the one thing you're evaluating now. The switch puts it on or off the routine without losing its history. {!formAct && !formTimed && "Split doses are checked off one portion at a time in the Day view."}</p>
        {doseChange ? (
          <div className="ht-status" style={{ marginBottom: 10 }}>
            <span>Dose changed from <b>{doseChange.from}</b> to <b>{doseChange.to}</b>. A dose change is a change — start a test window for it, or just update the number?</span>
          </div>
        ) : null}
        {doseChange ? (
          <div className="day-actions" style={{ marginBottom: 10 }}>
            <button className="btn sm" onClick={startDoseTest}>Start a test</button>
            <button className="btn ghost sm" onClick={() => applyEdit(doseChange.patch)}>Just update</button>
            <button className="ht-link" onClick={() => setDoseChange(null)}>Back</button>
          </div>
        ) : <button className="btn sm" onClick={submit} style={{ marginBottom: 10 }}>{editing ? "Save changes" : "Save"}</button>}
      </div>}
      {sorted.length === 0 ? (!adding && <p className="empty">{EMPTY_HINT[kind]}</p>) : narrow ? (
        <div className="llist">
          {sorted.map((x) => (
            <CompactRow key={x.id} off={!isOn(x)} lead={onSwitch(x)} name={x.name} pill={statusSelect(x)}
              sub={[amountText(x) !== "—" ? amountText(x) : null, scheduleLabel(x)].filter(Boolean).join(" · ")}
              kv={[[act ? "Details" : "Dose", amountText(x)], ["When", scheduleLabel(x)], ["Start", x.start || "—"], ["End", endInput(x)], ["From", x.source || "—"], ["Outcome", outcomeInput(x)]]}
              actions={actions(x)} />
          ))}
        </div>
      ) : (
        <div className="tscroll"><table className="t"><thead><tr><th>On</th><th>Name</th><th>{act ? "Details" : "Dose"}</th><th>When</th><th>Start</th><th>End</th><th>Status</th><th>Outcome</th><th></th></tr></thead>
          <tbody>{sorted.map((x) => (
            <tr key={x.id} className={isOn(x) ? "" : "off"}>
              <td>{onSwitch(x)}</td>
              <td>{x.name}{x.source ? <div className="hint">{x.source}</div> : null}</td>
              <td>{amountText(x)}</td>
              <td style={{ color: "var(--ink2)" }}>{scheduleLabel(x)}</td>
              <td>{x.start || "—"}</td>
              <td>{endInput(x)}</td>
              <td>{statusSelect(x)}</td>
              <td>{outcomeInput(x)}</td>
              <td style={{ whiteSpace: "nowrap" }}>{actions(x)}</td>
            </tr>
          ))}</tbody></table></div>
      )}
      <Archived items={archived} onRestore={restore} onDelete={purge} hasHistory={hasHistory} />
    </div>
  );
}

function Foods({ kind, data, save, openWindow }) {
  const drink = kind === "drink";
  const blank = { name: "", kind, size: "", category: "", status: "unknown", confidence: "low", lastTested: "" };
  const narrow = useNarrow();
  const [f, setF] = useState(blank);
  const [warn, setWarn] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // id of the food being edited
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const block = () => setWarn(`${openWindow.name} is already being tested. Two changes at once means neither result can be trusted — close that one first.`);
  const closeForm = () => { setF(blank); setEditing(null); setAdding(false); };
  const startEdit = (x) => { setF({ name: x.name, kind: x.kind || "food", size: x.size || "", category: x.category || "", status: x.status, confidence: x.confidence, lastTested: x.lastTested || "" }); setEditing(x.id); setAdding(true); setWarn(""); };
  const submit = () => {
    if (!f.name.trim()) return;
    const cur = editing ? data.foods.find((x) => x.id === editing) : null;
    if (f.status === "testing" && openWindow && openWindow.name !== cur?.name) return block();
    setWarn("");
    if (editing) save({ ...data, foods: data.foods.map((x) => x.id === editing ? { ...x, ...f } : x) });
    else save({ ...data, foods: [...data.foods, { ...f, id: uid(), lastTested: f.lastTested || (f.status === "testing" ? today() : "") }] });
    closeForm();
  };
  const setStatus = (id, status) => {
    const cur = data.foods.find((x) => x.id === id);
    if (status === "testing" && openWindow && openWindow.name !== cur?.name) return block();
    setWarn("");
    save({ ...data, foods: data.foods.map((x) => x.id === id ? { ...x, status, lastTested: today() } : x) });
  };
  const remove = (id) => save({ ...data, foods: data.foods.map((x) => x.id === id ? { ...x, archivedAt: now(), status: x.status === "testing" ? "unknown" : x.status } : x) });
  const restore = (id) => save({ ...data, foods: data.foods.map((x) => x.id === id ? { ...x, archivedAt: "" } : x) });
  const hasHistory = (x) => x.status !== "unknown" || data.entries.some((e) => (e.extras || []).some((m) => m.items.toLowerCase().includes(x.name.toLowerCase())) || (e.drinks || []).some((d) => d.name.toLowerCase() === x.name.toLowerCase()));
  const purge = (id) => save({ ...data, foods: data.foods.filter((x) => x.id !== id) });
  const order = { testing: 0, "not tolerated": 1, unknown: 2, tolerated: 3 };
  const ofKind = data.foods.filter((x) => (x.kind || "food") === kind);
  const mine = ofKind.filter((x) => !x.archivedAt), archived = ofKind.filter((x) => x.archivedAt);
  const sorted = [...mine].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const statusSelect = (x) => <select value={x.status} onChange={(e) => setStatus(x.id, e.target.value)} className={`pill ${x.status.replace(" ", "-")}`}>{FOOD_STATUS.map((s) => <option key={s}>{s}</option>)}</select>;
  const actions = (x) => <><button className="ht-link" onClick={() => startEdit(x)}>Edit</button><button className="ht-link" onClick={() => remove(x.id)} title="Takes it off your Index. Its history is kept.">Remove</button></>;

  return (
    <div className="card">
      <div className="card-head">
        <h3>{drink ? "Drinks" : "Foods"}</h3>
        <button className="btn ghost sm" onClick={() => adding ? closeForm() : setAdding(true)}>{adding ? "Cancel" : "Add"}</button>
      </div>
      {warn && <p className="warn">{warn}</p>}
      {adding && <div className="addform">
        {editing && <p className="hint" style={{ margin: "0 0 8px" }}>Editing <b>{data.foods.find((x) => x.id === editing)?.name}</b></p>}
        <div className="ht-row">
          <div className="ht-field">{drink ? "Drink" : "Food"}<input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder={drink ? "Coffee" : "White rice"} autoFocus /></div>
          {drink && <div className="ht-field">Usual size<input value={f.size} onChange={(e) => set("size", e.target.value)} placeholder="12 oz" /></div>}
          <div className="ht-field">Category<input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder={drink ? "Caffeinated" : "Grain"} /></div>
          <div className="ht-field">Status<select value={f.status} onChange={(e) => set("status", e.target.value)}>{FOOD_STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="ht-field">Confidence<select value={f.confidence} onChange={(e) => set("confidence", e.target.value)}>{CONFIDENCE.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="ht-field">Last tested<input type="date" value={f.lastTested} onChange={(e) => set("lastTested", e.target.value)} /></div>
        </div>
        <button className="btn sm" onClick={submit} style={{ marginBottom: 10 }}>{editing ? "Save changes" : "Save"}</button>
      </div>}
      {sorted.length === 0 ? (!adding && <p className="empty">{drink ? "Drinks you have regularly. Saved here, they show up under Repeat on the Day view, and one can be tested like a food." : "Nothing here yet. Start with the foods you already know are safe — that's your baseline."}</p>) : narrow ? (
        <div className="llist">
          {sorted.map((x) => (
            <CompactRow key={x.id} name={x.name} pill={statusSelect(x)}
              sub={[x.size, x.category, `${x.confidence} confidence`, x.lastTested ? `tested ${x.lastTested}` : null].filter(Boolean).join(" · ")}
              kv={[...(drink ? [["Usual size", x.size || "—"]] : []), ["Category", x.category || "—"], ["Confidence", x.confidence], ["Last tested", x.lastTested || "—"]]}
              actions={actions(x)} />
          ))}
        </div>
      ) : (
        <div className="tscroll"><table className="t"><thead><tr><th>{drink ? "Drink" : "Food"}</th>{drink && <th>Usual size</th>}<th>Category</th><th>Status</th><th>Confidence</th><th>Last tested</th><th></th></tr></thead>
          <tbody>{sorted.map((x) => (
            <tr key={x.id}>
              <td>{x.name}</td>{drink && <td>{x.size || "—"}</td>}<td style={{ color: "var(--mute)" }}>{x.category || "—"}</td>
              <td>{statusSelect(x)}</td>
              <td>{x.confidence}</td><td>{x.lastTested || "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>{actions(x)}</td>
            </tr>
          ))}</tbody></table></div>
      )}
      <Archived items={archived} onRestore={restore} onDelete={purge} hasHistory={hasHistory} />
    </div>
  );
}
