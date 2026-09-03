import { useState } from "react";
import { today, addDays, uid, FOOD_STATUS, CONFIDENCE, INT_TYPE, INT_STATUS, isOn } from "../lib/utils.js";
import { useNarrow } from "../lib/useNarrow.js";

export default function Library({ data, save, openWindow }) {
  return (
    <div className="lib">
      <Interventions data={data} save={save} openWindow={openWindow} />
      <Foods data={data} save={save} openWindow={openWindow} />
    </div>
  );
}

// One expandable row for phones: a compact line (name, summary, status) that
// opens into the full labelled detail. `head` is the summary line, `kv` the
// label/value pairs shown when open, `actions` the Edit/Remove links.
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

function Foods({ data, save, openWindow }) {
  const blank = { name: "", category: "", status: "unknown", confidence: "low", lastTested: "" };
  const narrow = useNarrow();
  const [f, setF] = useState(blank);
  const [warn, setWarn] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // id of the food being edited
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const block = () => setWarn(`${openWindow.name} is already being tested. Two changes at once means neither result can be trusted — close that one first.`);
  const closeForm = () => { setF(blank); setEditing(null); setAdding(false); };
  const startEdit = (x) => { setF({ name: x.name, category: x.category || "", status: x.status, confidence: x.confidence, lastTested: x.lastTested || "" }); setEditing(x.id); setAdding(true); setWarn(""); };
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
  const remove = (id) => save({ ...data, foods: data.foods.filter((x) => x.id !== id) });
  const order = { testing: 0, "not tolerated": 1, unknown: 2, tolerated: 3 };
  const sorted = [...data.foods].sort((a, b) => order[a.status] - order[b.status] || a.name.localeCompare(b.name));
  const statusSelect = (x) => <select value={x.status} onChange={(e) => setStatus(x.id, e.target.value)} className={`pill ${x.status.replace(" ", "-")}`}>{FOOD_STATUS.map((s) => <option key={s}>{s}</option>)}</select>;
  const actions = (x) => <><button className="ht-link" onClick={() => startEdit(x)}>Edit</button><button className="ht-link" onClick={() => remove(x.id)}>Remove</button></>;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ flex: 1 }}>Foods</h3>
        <button className="btn ghost sm" onClick={() => adding ? closeForm() : setAdding(true)}>{adding ? "Cancel" : "Add food"}</button>
      </div>
      {warn && <p className="warn">{warn}</p>}
      {adding && <div className="addform">
        {editing && <p className="hint" style={{ margin: "0 0 8px" }}>Editing <b>{data.foods.find((x) => x.id === editing)?.name}</b></p>}
        <div className="ht-row">
          <div className="ht-field">Food<input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="White rice" autoFocus /></div>
          <div className="ht-field">Category<input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Grain" /></div>
          <div className="ht-field">Status<select value={f.status} onChange={(e) => set("status", e.target.value)}>{FOOD_STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="ht-field">Confidence<select value={f.confidence} onChange={(e) => set("confidence", e.target.value)}>{CONFIDENCE.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="ht-field">Last tested<input type="date" value={f.lastTested} onChange={(e) => set("lastTested", e.target.value)} /></div>
        </div>
        <button className="btn sm" onClick={submit} style={{ marginBottom: 10 }}>{editing ? "Save changes" : "Save food"}</button>
      </div>}
      {sorted.length === 0 ? <p className="empty">Nothing here yet. Start with the foods you already know are safe — that's your baseline.</p> : narrow ? (
        <div className="llist">
          {sorted.map((x) => (
            <CompactRow key={x.id} name={x.name} pill={statusSelect(x)}
              sub={[x.category, `${x.confidence} confidence`, x.lastTested ? `tested ${x.lastTested}` : null].filter(Boolean).join(" · ")}
              kv={[["Category", x.category || "—"], ["Confidence", x.confidence], ["Last tested", x.lastTested || "—"]]}
              actions={actions(x)} />
          ))}
        </div>
      ) : (
        <div className="tscroll"><table className="t"><thead><tr><th>Food</th><th>Category</th><th>Status</th><th>Confidence</th><th>Last tested</th><th></th></tr></thead>
          <tbody>{sorted.map((x) => (
            <tr key={x.id}>
              <td>{x.name}</td><td style={{ color: "var(--mute)" }}>{x.category || "—"}</td>
              <td>{statusSelect(x)}</td>
              <td>{x.confidence}</td><td>{x.lastTested || "—"}</td>
              <td style={{ whiteSpace: "nowrap" }}>{actions(x)}</td>
            </tr>
          ))}</tbody></table></div>
      )}
    </div>
  );
}

function Interventions({ data, save, openWindow }) {
  const blank = { name: "", type: "supplement", dose: "", start: today(), end: "", source: "", status: "baseline" };
  const narrow = useNarrow();
  const [f, setF] = useState(blank);
  const [warn, setWarn] = useState("");
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const block = () => setWarn(`${openWindow.name} is already being tested. One open test at a time — otherwise you won't know which change did what.`);
  const closeForm = () => { setF(blank); setEditing(null); setAdding(false); };
  const startEdit = (x) => { setF({ name: x.name, type: x.type, dose: x.dose || "", start: x.start || "", end: x.end || "", source: x.source || "", status: x.status }); setEditing(x.id); setAdding(true); setWarn(""); };
  const submit = () => {
    if (!f.name.trim()) return;
    const cur = editing ? data.interventions.find((x) => x.id === editing) : null;
    if (f.status === "testing" && openWindow && cur?.status !== "testing") return block();
    setWarn("");
    if (editing) save({ ...data, interventions: data.interventions.map((x) => x.id === editing ? { ...x, ...f } : x) });
    else save({ ...data, interventions: [...data.interventions, { ...f, outcome: "", id: uid() }] });
    closeForm();
  };
  const update = (id, patch) => {
    const cur = data.interventions.find((x) => x.id === id);
    if (patch.status === "testing" && openWindow && cur?.status !== "testing") return block();
    setWarn("");
    save({ ...data, interventions: data.interventions.map((x) => x.id === id ? { ...x, ...patch } : x) });
  };
  const remove = (id) => save({ ...data, interventions: data.interventions.filter((x) => x.id !== id) });
  const order = { testing: 0, baseline: 1, established: 2, discontinued: 3 };
  const sorted = [...data.interventions].sort((a, b) => (isOn(b) - isOn(a)) || order[a.status] - order[b.status] || (b.start || "").localeCompare(a.start || ""));
  const toggleOn = (x) => {
    if (isOn(x)) update(x.id, { end: addDays(today(), -1) });
    else update(x.id, { end: "", start: x.start || today(), status: x.status === "discontinued" ? "baseline" : x.status });
  };
  const onCount = data.interventions.filter(isOn).length;
  const onSwitch = (x) => <button className={"switch" + (isOn(x) ? " on" : "")} onClick={() => toggleOn(x)} title={isOn(x) ? "Taking — switch off" : "Not taking — switch on"} />;
  const statusSelect = (x) => <select value={x.status} onChange={(e) => update(x.id, { status: e.target.value })} className={`pill ${x.status}`}>{INT_STATUS.map((s) => <option key={s}>{s}</option>)}</select>;
  const endInput = (x) => <input type="date" value={x.end || ""} onChange={(e) => update(x.id, { end: e.target.value })} style={{ width: 118 }} />;
  const outcomeInput = (x) => <input value={x.outcome || ""} onChange={(e) => update(x.id, { outcome: e.target.value })} placeholder="What happened" style={{ width: 130 }} />;
  const actions = (x) => <><button className="ht-link" onClick={() => startEdit(x)}>Edit</button><button className="ht-link" onClick={() => remove(x.id)}>Remove</button></>;

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ flex: 1 }}>Supplements & treatments <span className="hint" style={{ fontWeight: 400 }}>· {onCount} on</span></h3>
        <button className="btn ghost sm" onClick={() => adding ? closeForm() : setAdding(true)}>{adding ? "Cancel" : "Add"}</button>
      </div>
      {warn && <p className="warn">{warn}</p>}
      {adding && <div className="addform">
        {editing && <p className="hint" style={{ margin: "0 0 8px" }}>Editing <b>{data.interventions.find((x) => x.id === editing)?.name}</b></p>}
        <div className="ht-row">
          <div className="ht-field">Name<input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="Magnesium glycinate" autoFocus /></div>
          <div className="ht-field">Type<select value={f.type} onChange={(e) => set("type", e.target.value)}>{INT_TYPE.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="ht-field">Dose<input value={f.dose} onChange={(e) => set("dose", e.target.value)} placeholder="200 mg, evening" /></div>
          <div className="ht-field">Recommended by<input value={f.source} onChange={(e) => set("source", e.target.value)} placeholder="Practitioner, book, self" /></div>
        </div>
        <div className="ht-row">
          <div className="ht-field">Start<input type="date" value={f.start} onChange={(e) => set("start", e.target.value)} /></div>
          <div className="ht-field">End<input type="date" value={f.end} onChange={(e) => set("end", e.target.value)} /></div>
          <div className="ht-field">Status<select value={f.status} onChange={(e) => set("status", e.target.value)}>{INT_STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
        </div>
        <p className="hint" style={{ margin: "-6px 0 10px" }}>Baseline: already taking, not changing. Testing: the one thing you're evaluating now. The switch turns it on or off without losing its history — off sets the end date to yesterday so today's checklist drops it.</p>
        <button className="btn sm" onClick={submit} style={{ marginBottom: 10 }}>{editing ? "Save changes" : "Save"}</button>
      </div>}
      {sorted.length === 0 ? <p className="empty">Add everything you currently take as <i>baseline</i> first, so the trends chart has context.</p> : narrow ? (
        <div className="llist">
          {sorted.map((x) => (
            <CompactRow key={x.id} off={!isOn(x)} lead={onSwitch(x)} name={x.name} pill={statusSelect(x)}
              sub={[x.type, x.dose, x.start ? `from ${x.start}` : null, x.end ? `to ${x.end}` : null].filter(Boolean).join(" · ")}
              kv={[["Type", x.type], ["Dose", x.dose || "—"], ["Start", x.start || "—"], ["End", endInput(x)], ["From", x.source || "—"], ["Outcome", outcomeInput(x)]]}
              actions={actions(x)} />
          ))}
        </div>
      ) : (
        <div className="tscroll"><table className="t"><thead><tr><th>On</th><th>Name</th><th>Type</th><th>Dose</th><th>Start</th><th>End</th><th>From</th><th>Status</th><th>Outcome</th><th></th></tr></thead>
          <tbody>{sorted.map((x) => (
            <tr key={x.id} className={isOn(x) ? "" : "off"}>
              <td>{onSwitch(x)}</td>
              <td>{x.name}</td><td style={{ color: "var(--mute)" }}>{x.type}</td><td>{x.dose || "—"}</td><td>{x.start || "—"}</td>
              <td>{endInput(x)}</td>
              <td style={{ color: "var(--mute)" }}>{x.source || "—"}</td>
              <td>{statusSelect(x)}</td>
              <td>{outcomeInput(x)}</td>
              <td style={{ whiteSpace: "nowrap" }}>{actions(x)}</td>
            </tr>
          ))}</tbody></table></div>
      )}
    </div>
  );
}
