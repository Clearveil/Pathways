import { useState } from "react";
import { iso, today, mealsOn, logged, adherence, testingOn, fmtShort } from "../lib/utils.js";
import { useNarrow } from "../lib/useNarrow.js";
import PlanImport from "./PlanImport.jsx";
import { Upload, Trash, Flask } from "./Icons.jsx";

// The small facts shown for one day, shared by the desktop grid cell and the
// phone list row so both always say the same thing.
function DayBits({ data, e, ds }) {
  const a = adherence(data, e, ds);
  const mo = mealsOn(data, e, ds);
  const t = testingOn(data, ds);
  return (
    <>
      {a && ds <= today() ? <span className="m" style={{ color: a.taken === a.due ? "var(--acc-ink)" : a.taken === 0 ? "var(--bad)" : undefined }}>{a.taken}/{a.due} taken</span> : null}
      {e?.flare && <span className="f">flare {e.severity}</span>}
      {e?.activity && e.activity !== "rest" && <span className="m">{e.activity}</span>}
      {t && <span className="m" style={{ color: "var(--acc-ink)" }}><Flask size={11} /> {t}</span>}
      {mo && ds <= today() ? <span className="m" style={{ color: mo.eaten === mo.planned ? "var(--acc-ink)" : undefined }}>{mo.eaten}/{mo.planned} meals</span> : mo ? <span className="m">{mo.planned} planned</span> : null}
      {(e?.extras || []).length > 0 && <span className="m">+{e.extras.length}</span>}
    </>
  );
}

export default function Month({ data, save, date, setDate, goDay }) {
  const narrow = useNarrow();
  const [msg, setMsg] = useState("");
  const [menu, setMenu] = useState(null); // "import" | "clear" | null
  const [y, m] = date.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const byDate = Object.fromEntries(data.entries.map((e) => [e.date, e]));
  const shift = (n) => setDate(iso(new Date(y, m - 1 + n, 1)));

  const hasMeals = data.meals.length > 0;
  const hasWo = (data.workouts || []).length > 0;
  const clearPlan = (what) => {
    const next = { ...data };
    if (what === "meals" || what === "both") next.meals = [];
    if (what === "workouts" || what === "both") next.workouts = [];
    save(next);
    setMenu(null);
    setMsg(what === "both" ? "Both plans removed. Your logged days are untouched." : `${what === "meals" ? "Meal" : "Workout"} plan removed. Your logged days are untouched.`);
  };

  return (
    <>
      <div className="ht-nav">
        <button onClick={() => shift(-1)}>‹</button>
        <button onClick={() => shift(1)}>›</button>
        {date.slice(0,7) !== today().slice(0,7) && <button className="today" onClick={() => setDate(today())}>This month</button>}
        <h2>{first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
        <span className="ht-spacer" />
        <div className="ht-tools">
          <button className="btn ghost xs" onClick={() => setMenu("import")} aria-haspopup="dialog"><Upload size={13} /> Import</button>
          <div className="menu-wrap">
            <button className="btn ghost xs" onClick={() => setMenu(menu === "clear" ? null : "clear")} disabled={!hasMeals && !hasWo} aria-expanded={menu === "clear"}><Trash size={13} /> Remove plan</button>
            {menu === "clear" && <div className="menu">
              {hasMeals && <button onClick={() => clearPlan("meals")}>Meal plan<small>{data.meals.length} meals · what you logged is kept</small></button>}
              {hasWo && <button onClick={() => clearPlan("workouts")}>Workout plan<small>{data.workouts.length} workouts · what you logged is kept</small></button>}
              {hasMeals && hasWo && <button onClick={() => clearPlan("both")}>Both<small>clears every imported plan</small></button>}
              <button className="cancel" onClick={() => setMenu(null)}>Cancel</button>
            </div>}
          </div>
        </div>
      </div>
      <PlanImport data={data} save={save} open={menu === "import"} onClose={() => setMenu(null)} onMessage={setMsg} />
      {msg && <p className="hint" style={{ marginBottom: 10 }}>{msg}</p>}
      {narrow ? (
        // Phone: seven columns don't survive a 375px screen. One row per day instead.
        <div className="mlist">
          {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
            const ds = `${date.slice(0,7)}-${String(d).padStart(2,"0")}`;
            const e = byDate[ds];
            return (
              <button key={ds} className={"mrow" + (ds === today() ? " today" : "") + (ds > today() ? " future" : "")} onClick={() => goDay(ds)}>
                <span className="d">{fmtShort(ds)}</span>
                <span className="e">{logged(e) ? <>{e.energy}{e.inflammation ? <span className="m" style={{ fontSize: 11, color: "var(--mute)" }}> / {e.inflammation}</span> : null}</> : <span style={{ color: "var(--line)" }}>–</span>}</span>
                <span className="tags"><DayBits data={data} e={e} ds={ds} /></span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="month">
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((h) => <div key={h} className="hd">{h}</div>)}
          {cells.map((d, i) => {
            if (!d) return <div key={i} className="mcell blank" />;
            const ds = `${date.slice(0,7)}-${String(d).padStart(2,"0")}`;
            const e = byDate[ds];
            return (
              <button key={i} className={"mcell" + (ds === today() ? " today" : "")} onClick={() => goDay(ds)}>
                <span className="d">{d}</span>
                {logged(e) && <span className="e">{e.energy}{e.inflammation ? <span className="m" style={{ fontSize: 11 }}> / {e.inflammation}</span> : null}</span>}
                <DayBits data={data} e={e} ds={ds} />
              </button>
            );
          })}
        </div>
      )}
      <p className="hint" style={{ marginTop: 12 }}>Big number is energy, small is inflammation. The flask marks a day inside a test window. Meals show eaten/planned, workouts as done/planned.</p>
    </>
  );
}
