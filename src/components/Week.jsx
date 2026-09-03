import { today, addDays, mealsOn, logged, adherence, testingOn, fmtShort } from "../lib/utils.js";
import { Flask } from "./Icons.jsx";

export default function Week({ data, date, setDate, goDay }) {
  const d = new Date(date + "T12:00:00");
  const start = addDays(date, -d.getDay());
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const byDate = Object.fromEntries(data.entries.map((e) => [e.date, e]));
  const mealsBy = {};
  data.meals.forEach((m) => { (mealsBy[m.date] ||= []).push(m); });
  const end = addDays(start, 6);
  return (
    <>
      <div className="ht-nav">
        <button onClick={() => setDate(addDays(date, -7))}>‹</button>
        <button onClick={() => setDate(addDays(date, 7))}>›</button>
        {!days.includes(today()) && <button className="today" onClick={() => setDate(today())}>This week</button>}
        <h2>{new Date(start + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })} – {new Date(end + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</h2>
      </div>
      <div className="week">
        {days.map((ds) => {
          const e = byDate[ds];
          const ms = mealsBy[ds] || [];
          return (
            <button key={ds} className={"cell" + (ds === today() ? " today" : "") + (!logged(e) ? " empty-cell" : "")} onClick={() => goDay(ds)}>
              <span className="date">{fmtShort(ds)}</span>
              {logged(e) ? <span className="energy">{e.energy}<small>/10</small></span> : <span className="hint">{ds > today() ? "" : "Not logged"}</span>}
              {(() => { const a = adherence(data, e, ds); return a && ds <= today() ? <span className="meta" style={{ color: a.taken === a.due ? "var(--acc-ink)" : a.taken === 0 ? "var(--bad)" : "var(--ink2)" }}>Regimen {a.taken}/{a.due}</span> : null; })()}
              {e?.inflammation && <span className="meta">Inflammation {e.inflammation}</span>}
              {e?.flare && <span className="meta flare">Flare · {e.severity}/5</span>}
              {e?.activity && <span className="meta">{e.activity[0].toUpperCase() + e.activity.slice(1)}{e.activityNote ? ` · ${e.activityNote}` : ""}</span>}
              {testingOn(data, ds) && <span className="meta" style={{ color: "var(--acc-ink)" }}><Flask size={11} /> Testing {testingOn(data, ds)}</span>}
              {(() => { const mo = mealsOn(data, e, ds); return mo && ds <= today() ? <span className="meta" style={{ color: mo.eaten === mo.planned ? "var(--acc-ink)" : undefined }}>Meals {mo.eaten}/{mo.planned}</span> : mo ? <span className="meta">{mo.planned} meals planned</span> : null; })()}
              {(e?.extras || []).length > 0 && <span className="meta">+{e.extras.length} unplanned</span>}
              {e?.notes && <span className="meta" style={{ color: "var(--mute)" }}>{e.notes.split("\n")[0].slice(0, 48)}{e.notes.length > 48 ? "…" : ""}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

