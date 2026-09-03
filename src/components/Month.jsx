import { useState, useRef } from "react";
import Papa from "papaparse";
import { iso, today, mealsOn, normDate, logged, adherence, testingOn } from "../lib/utils.js";

export default function Month({ data, save, date, setDate, goDay }) {
  const fileRef = useRef();
  const woRef = useRef();
  const [msg, setMsg] = useState("");
  const [menu, setMenu] = useState(null);
  const [y, m] = date.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const days = new Date(y, m, 0).getDate();
  const cells = [...Array(first.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const byDate = Object.fromEntries(data.entries.map((e) => [e.date, e]));
  const mealsBy = {};
  data.meals.forEach((r) => { (mealsBy[r.date] ||= []).push(r); });
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

  const importWorkouts = (file) => {
    Papa.parse(file, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase(), complete: (res) => {
      const cols = Object.keys(res.data[0] || {});
      if (!cols.includes("date")) { setMsg(`Couldn't find a "date" column. Found: ${cols.join(", ") || "nothing"}. Needs date, workout, details.`); return; }
      const bad = [];
      const rows = res.data.map((r) => {
        const d = r.date ? normDate(r.date) : null;
        if (r.date && !d) bad.push(r.date);
        return d && (r.workout || r.details) ? { date: d, workout: (r.workout || "workout").trim(), details: (r.details || "").trim() } : null;
      }).filter(Boolean);
      if (!rows.length) { setMsg(bad.length ? `Couldn't read the dates (e.g. "${bad[0]}"). Use YYYY-MM-DD.` : "No usable rows. Each row needs a date and a workout."); return; }
      const dates = new Set(rows.map((r) => r.date));
      save({ ...data, workouts: [...(data.workouts || []).filter((x) => !dates.has(x.date)), ...rows] });
      setMsg(`Loaded ${rows.length} workouts across ${dates.size} days${bad.length ? `, skipped ${bad.length} unreadable` : ""}.`);
    } });
  };

  const importCSV = (file) => {
    Papa.parse(file, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase(), complete: (res) => {
      const cols = Object.keys(res.data[0] || {});
      if (!cols.includes("date")) { setMsg(`Couldn't find a "date" column. Found: ${cols.join(", ") || "nothing"}. Needs date, meal, items.`); return; }
      const bad = [];
      const rows = res.data.map((r) => {
        const d = r.date ? normDate(r.date) : null;
        if (r.date && !d) bad.push(r.date);
        return d && (r.meal || r.items) ? { date: d, meal: (r.meal || "meal").trim(), items: (r.items || "").trim() } : null;
      }).filter(Boolean);
      if (!rows.length) { setMsg(bad.length ? `Couldn't read the dates (e.g. "${bad[0]}"). Use YYYY-MM-DD.` : "No usable rows. Each row needs a date and a meal or items."); return; }
      const dates = new Set(rows.map((r) => r.date));
      save({ ...data, meals: [...data.meals.filter((x) => !dates.has(x.date)), ...rows] });
      setMsg(`Loaded ${rows.length} meals across ${dates.size} days${bad.length ? `, skipped ${bad.length} row${bad.length>1?"s":""} with unreadable dates` : ""}. Jump to a date to see them.`);
    } });
  };

  return (
    <>
      <div className="ht-nav">
        <button onClick={() => shift(-1)}>‹</button>
        <button onClick={() => shift(1)}>›</button>
        {date.slice(0,7) !== today().slice(0,7) && <button className="today" onClick={() => setDate(today())}>This month</button>}
        <h2>{first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
        <span className="ht-spacer" />
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) importCSV(e.target.files[0]); e.target.value = ""; }} />
        <input ref={woRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) importWorkouts(e.target.files[0]); e.target.value = ""; }} />
        <div className="menu-wrap">
          <button className="btn ghost xs" onClick={() => setMenu(menu === "import" ? null : "import")} aria-expanded={menu === "import"}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M8 10.5V2M8 2 4.75 5.25M8 2l3.25 3.25M2.5 10.5v2.25a1 1 0 0 0 1 1h9a1 1 0 0 0 1-1V10.5" /></svg>
            Import
          </button>
          {menu === "import" && <div className="menu">
            <button onClick={() => { setMenu(null); fileRef.current.click(); }}>Meal plan<small>date, meal, items</small></button>
            <button onClick={() => { setMenu(null); woRef.current.click(); }}>Workout plan<small>date, workout, details</small></button>
          </div>}
        </div>
        <div className="menu-wrap">
          <button className="btn ghost xs" onClick={() => setMenu(menu === "clear" ? null : "clear")} disabled={!hasMeals && !hasWo} aria-expanded={menu === "clear"}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M2.75 4.5h10.5M6.25 4.5V3.25a.75.75 0 0 1 .75-.75h2a.75.75 0 0 1 .75.75V4.5M4 4.5l.6 8.1a1 1 0 0 0 1 .9h4.8a1 1 0 0 0 1-.9l.6-8.1" /></svg>
            Remove plan
          </button>
          {menu === "clear" && <div className="menu">
            {hasMeals && <button onClick={() => clearPlan("meals")}>Meal plan<small>{data.meals.length} meals · what you logged is kept</small></button>}
            {hasWo && <button onClick={() => clearPlan("workouts")}>Workout plan<small>{data.workouts.length} workouts · what you logged is kept</small></button>}
            {hasMeals && hasWo && <button onClick={() => clearPlan("both")}>Both<small>clears every imported plan</small></button>}
            <button className="cancel" onClick={() => setMenu(null)}>Cancel</button>
          </div>}
        </div>
      </div>
      {msg && <p className="hint" style={{ marginBottom: 10 }}>{msg}</p>}
      <div className="month">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((h) => <div key={h} className="hd">{h}</div>)}
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="mcell blank" />;
          const ds = `${date.slice(0,7)}-${String(d).padStart(2,"0")}`;
          const e = byDate[ds]; const ms = mealsBy[ds] || [];
          return (
            <button key={i} className={"mcell" + (ds === today() ? " today" : "")} onClick={() => goDay(ds)}>
              <span className="d">{d}</span>
              {logged(e) && <span className="e">{e.energy}{e.inflammation ? <span className="m" style={{ fontSize: 11 }}> / {e.inflammation}</span> : null}</span>}
              {(() => { const a = adherence(data, e, ds); return a && ds <= today() ? <span className="m" style={{ color: a.taken === a.due ? "var(--acc-ink)" : a.taken === 0 ? "var(--bad)" : undefined }}>{a.taken}/{a.due} taken</span> : null; })()}
              {e?.flare && <span className="f">flare {e.severity}</span>}
              {e?.activity && e.activity !== "rest" && <span className="m">{e.activity}</span>}
              {testingOn(data, ds) && <span className="m" style={{ color: "var(--acc-ink)" }}>▪ {testingOn(data, ds)}</span>}
              {(() => { const mo = mealsOn(data, e, ds); return mo && ds <= today() ? <span className="m" style={{ color: mo.eaten === mo.planned ? "var(--acc-ink)" : undefined }}>{mo.eaten}/{mo.planned} meals</span> : mo ? <span className="m">{mo.planned} planned</span> : null; })()}
              {(e?.extras || []).length > 0 && <span className="m">+{e.extras.length}</span>}
            </button>
          );
        })}
      </div>
      <p className="hint" style={{ marginTop: 12 }}>Big number is energy, small is inflammation. Purple marks a day inside a test window. Meals show eaten/planned, workouts as done/planned. Meal CSV: date, meal, items. Workout CSV: date, workout, details.</p>
    </>
  );
}

