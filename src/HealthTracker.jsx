import { useState, useEffect, useMemo, useRef } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer, CartesianGrid } from "recharts";
import Papa from "papaparse";

const KEY = "health-tracker-v1";
const iso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${String(x.getMonth()+1).padStart(2,"0")}-${String(x.getDate()).padStart(2,"0")}`; };
const today = () => iso(new Date());
const addDays = (ds, n) => { const d = new Date(ds + "T12:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const uid = () => Math.random().toString(36).slice(2, 9);
const SCHEMA = 2;
const EMPTY = { schema: SCHEMA, entries: [], foods: [], interventions: [], meals: [], workouts: [] };
const now = () => new Date().toISOString();

// Normalizes any older saved shape forward. Every row ends up with a stable id
// and updatedAt, which is what a server sync will need to merge safely.
function migrate(raw) {
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
const FOOD_STATUS = ["tolerated", "not tolerated", "unknown", "testing"];
const CONFIDENCE = ["low", "medium", "high"];
const INT_TYPE = ["supplement", "western", "naturopathic", "lifestyle"];
const INT_STATUS = ["baseline", "testing", "established", "discontinued"];
const ACTIVITY = ["rest", "light", "moderate", "hard"];
const activeOn = (data, ds) => data.interventions.filter((i) => i.start && i.start <= ds && (!i.end || i.end >= ds) && i.status !== "discontinued");
const isOn = (i) => !i.end || i.end >= today();
const mealKey = (m) => `${m.meal}|${m.items}`;
const mealsOn = (data, e, ds) => {
  const planned = data.meals.filter((m) => m.date === ds);
  if (!planned.length) return null;
  const eaten = (e?.meals || []).filter((k) => planned.some((m) => mealKey(m) === k)).length;
  return { eaten, planned: planned.length };
};
const woKey = (w) => `${w.workout}|${w.details}`;
const workoutsOn = (data, e, ds) => {
  const planned = (data.workouts || []).filter((w) => w.date === ds);
  const st = e?.woStatus || {};
  const extra = (e?.extraWorkouts || []).length;
  if (!planned.length && !extra) return null;
  const done = planned.filter((w) => st[woKey(w)] === "done").length;
  const mod = planned.filter((w) => st[woKey(w)] === "modified").length;
  const skip = planned.filter((w) => st[woKey(w)] === "skipped").length;
  return { planned: planned.length, done, mod, skip, extra };
};
// ---------------------------------------------------------------------------
// Storage boundary. Everything the app does with saved data goes through this.
// Swapping to Supabase means rewriting these three functions and nothing else.
// ---------------------------------------------------------------------------
// Step 1 (Vite port): the artifact's `window.storage` API doesn't exist in a
// real browser, so these three functions now talk to localStorage instead.
// Same signatures, same async shape — the rest of the app is untouched.
// Step 3 will rewrite these same three functions against Supabase.
const store = {
  async load() {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  },
  async saveAll(data) {
    localStorage.setItem(KEY, JSON.stringify(data)); // throws if storage is full or blocked
    return true;
  },
  async pref(k, v) {
    if (v === undefined) return localStorage.getItem(`${KEY}:${k}`);
    localStorage.setItem(`${KEY}:${k}`, v);
    return v;
  },
};

const normDate = (d) => {
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) { const yr = m[3].length === 2 ? "20" + m[3] : m[3]; return `${yr}-${m[1].padStart(2,"0")}-${m[2].padStart(2,"0")}`; }
  const p = new Date(s);
  return isNaN(p) ? null : iso(p);
};
const logged = (e) => e && e.energy != null;
const adherence = (data, e, ds) => {
  const due = activeOn(data, ds).filter((i) => i.type !== "lifestyle");
  if (!due.length) return null;
  const taken = (e?.taken || []).filter((id) => due.some((i) => i.id === id)).length;
  return { taken, due: due.length };
};
const testingOn = (data, ds) => {
  const i = data.interventions.find((x) => x.status === "testing" && x.start && x.start <= ds && (!x.end || x.end >= ds));
  if (i) return i.name;
  const f = data.foods.find((x) => x.status === "testing" && x.lastTested && x.lastTested <= ds);
  return f ? f.name : null;
};
const fmtLong = (ds) => new Date(ds + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
const fmtShort = (ds) => new Date(ds + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", day: "numeric" });

const css = `
  .ht {
    --bg:#FFFFFF; --bg2:#F6F6F6; --card:#FFFFFF; --line:#E4E4E4; --line2:#EFEFEF;
    --ink:#161616; --ink2:#5A5A5A; --mute:#8C8C8C; --field:#FAFAFA;
    --acc:#6B6480; --acc-hover:#5A536E; --acc-soft:#EDEBF2; --acc-ink:#4E4762;
    --bad:#9A3B2E; --bad-soft:#F5E6E3; --warn-soft:#F1EEE6; --warn-ink:#6B5A2E;
    --shadow:rgba(0,0,0,.06);
  }
  .ht.dark {
    --bg:#141414; --bg2:#1C1C1C; --card:#1E1E1E; --line:#2E2E2E; --line2:#262626;
    --ink:#ECECEC; --ink2:#B4B4B4; --mute:#7C7C7C; --field:#232323;
    --acc:#6F6688; --acc-hover:#7E759A; --acc-soft:#26232F; --acc-ink:#B7AFCB;
    --bad:#E08A7C; --bad-soft:#3A2521; --warn-soft:#2A2820; --warn-ink:#D9C89A;
    --shadow:rgba(0,0,0,.4);
  }
  .ht { font-family: -apple-system, "Segoe UI", system-ui, sans-serif; color:var(--ink); background:var(--bg); min-height:100vh; -webkit-font-smoothing:antialiased; }
  .ht * { box-sizing:border-box; }
  .ht h1,.ht h2,.ht h3 { font-family:inherit; font-weight:500; letter-spacing:-.01em; }
  .ht-top { display:flex; align-items:center; gap:10px; padding:18px 24px 0; flex-wrap:wrap; }
  .ht-top h1 { font-size:22px; margin:0; letter-spacing:-.01em; }
  .brand { font-size:12px; color:var(--mute); letter-spacing:.04em; text-transform:uppercase; }
  .ht-tabs { display:flex; gap:2px; background:var(--bg2); padding:3px; border-radius:10px; border:1px solid var(--line2); }
  .ht-tabs button { border:0; background:none; font:inherit; font-size:13px; padding:6px 13px; border-radius:8px; color:var(--ink2); cursor:pointer; }
  .ht-tabs button.on { background:var(--card); color:var(--ink); box-shadow:0 1px 2px var(--shadow); }
  .ht-spacer { flex:1; }
  .ht-link { border:0; background:none; font:inherit; font-size:13px; color:var(--mute); cursor:pointer; padding:6px 8px; border-radius:8px; }
  .ht-link:hover { background:var(--acc-soft); color:var(--acc-ink); }
  .ht-main { padding:16px 24px 60px; max-width:1040px; }
  .ht-status { display:flex; align-items:center; gap:10px; font-size:13px; padding:10px 14px; border-radius:12px; background:var(--warn-soft); color:var(--warn-ink); margin-bottom:18px; }
  .ht-status.clear { background:var(--acc-soft); color:var(--acc-ink); }
  .ht-status .dot { width:8px; height:8px; border-radius:50%; background:var(--warn-ink); flex-shrink:0; }
  .ht-status.clear .dot { background:var(--acc); }
  .ht-nav { display:flex; align-items:center; gap:8px; margin-bottom:14px; }
  .ht-nav h2 { font-size:20px; margin:0; }
  .ht-nav button { border:1px solid var(--line); background:var(--card); width:30px; height:30px; border-radius:8px; cursor:pointer; font-size:15px; color:var(--ink2); }
  .ht-nav button:hover { border-color:var(--acc); color:var(--acc); }
  .ht-nav .today { width:auto; padding:0 10px; font-size:12px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:16px 18px; }
  .card h3 { font-size:16px; margin:0 0 10px; }
  .ht-day { display:grid; grid-template-columns:1.2fr 1fr; gap:14px; }
  .ht-field { display:flex; flex-direction:column; gap:6px; margin-bottom:14px; font-size:13px; color:var(--ink2); }
  .ht-field input,.ht-field select,.ht-field textarea { font:inherit; font-size:14px; color:var(--ink); padding:9px 11px; border:1px solid var(--line); border-radius:10px; background:var(--field); color-scheme:light; }
  .ht.dark .ht-field input,.ht.dark .ht-field select,.ht.dark .ht-field textarea,.ht.dark .t input,.ht.dark .t select { color-scheme:dark; }
  .ht-field textarea { min-height:72px; resize:vertical; line-height:1.45; }
  .ht-field input:focus,.ht-field select:focus,.ht-field textarea:focus { outline:none; border-color:var(--acc); box-shadow:0 0 0 3px var(--acc-soft); background:var(--card); }
  .ht-row { display:flex; gap:12px; flex-wrap:wrap; }
  .ht-row .ht-field { flex:1; min-width:130px; }
  .btn { font:inherit; font-size:13px; padding:8px 14px; border-radius:10px; border:1px solid var(--acc); background:var(--acc); color:#fff; cursor:pointer; transition:background .15s, border-color .15s; }
  .btn:hover { background:var(--acc-hover); border-color:var(--acc-hover); }
  .btn.ghost { background:var(--card); color:var(--ink2); border-color:var(--line); }
  .btn.ghost:hover { border-color:var(--acc); color:var(--acc); background:var(--card); }
  .btn.sm { padding:5px 10px; font-size:12px; border-radius:8px; }
  .btn:disabled { opacity:.4; cursor:default; }
  .btn:focus-visible { outline:2px solid var(--acc); outline-offset:2px; }
  .scale { display:flex; gap:5px; }
  .scale button { flex:1; height:38px; border:1px solid var(--line); background:var(--field); font:inherit; font-size:13px; cursor:pointer; border-radius:9px; color:var(--ink2); transition:background .12s, border-color .12s; }
  .scale button:hover { border-color:var(--acc); color:var(--acc); }
  .scale button.on { background:var(--acc); color:#fff; border-color:var(--acc); }
  .pill { display:inline-block; padding:3px 9px; border-radius:999px; font-size:12px; }
  .pill.tolerated,.pill.established { background:var(--acc-soft); color:var(--acc-ink); }
  .pill.not-tolerated,.pill.discontinued { background:var(--bad-soft); color:var(--bad); }
  .pill.testing { background:var(--warn-soft); color:var(--warn-ink); }
  .pill.unknown,.pill.baseline { background:var(--bg2); color:var(--ink2); }
  .check { list-style:none; margin:0; padding:0; font-size:13px; }
  .check li { display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--line2); cursor:pointer; user-select:none; }
  .check li:last-child { border-bottom:0; }
  .check .box { width:18px; height:18px; border:1.5px solid var(--line); border-radius:5px; display:flex; align-items:center; justify-content:center; font-size:12px; color:#fff; flex-shrink:0; transition:background .12s, border-color .12s; }
  .check li:hover .box { border-color:var(--acc); }
  .check li.on .box { background:var(--acc); border-color:var(--acc); }
  .check .box.mod { background:var(--warn-ink); border-color:var(--warn-ink); color:#fff; }
  .check .box.skip { background:var(--line); border-color:var(--line); color:var(--mute); }
  .check li.on span:not(.box):not(.pill) { color:var(--mute); }
  .switch { width:34px; height:20px; border-radius:999px; border:0; background:var(--line); position:relative; cursor:pointer; padding:0; transition:background .15s; flex-shrink:0; }
  .switch::after { content:""; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:left .15s; box-shadow:0 1px 2px rgba(0,0,0,.2); }
  .switch.on { background:var(--acc); }
  .switch.on::after { left:16px; }
  .t tr.off td { color:var(--mute); }
  .list { list-style:none; margin:0; padding:0; font-size:13px; }
  .list li { display:flex; justify-content:space-between; gap:10px; padding:7px 0; border-bottom:1px solid var(--line2); }
  .list li:last-child { border-bottom:0; }
  .list .muted { color:var(--mute); }
  .empty { font-size:13px; color:var(--mute); line-height:1.5; }
  .week { display:grid; grid-template-columns:repeat(7,1fr); gap:10px; }
  .cell { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:12px; cursor:pointer; min-height:150px; display:flex; flex-direction:column; gap:8px; text-align:left; font:inherit; color:var(--ink); transition:border-color .12s; }
  .cell:hover { border-color:var(--acc); }
  .cell.today { border-color:var(--acc); box-shadow:0 0 0 3px var(--acc-soft); }
  .cell.empty-cell { background:var(--bg2); }
  .cell .date { font-size:12px; color:var(--mute); }
  .cell .energy { font-size:28px; line-height:1; }
  .cell .energy small { font-size:12px; color:var(--mute); margin-left:3px; }
  .cell .meta { font-size:11px; color:var(--ink2); line-height:1.4; }
  .cell .flare { color:var(--bad); }
  .month { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; }
  .month .hd { font-size:11px; color:var(--mute); text-align:center; padding-bottom:4px; }
  .mcell { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:8px; min-height:72px; cursor:pointer; font:inherit; color:var(--ink); text-align:left; display:flex; flex-direction:column; gap:3px; transition:border-color .12s; }
  .mcell:hover { border-color:var(--acc); }
  .mcell.today { border-color:var(--acc); }
  .mcell.blank { background:transparent; border-color:transparent; cursor:default; }
  .mcell .d { font-size:11px; color:var(--mute); }
  .mcell .e { font-size:18px; }
  .mcell .f { font-size:10px; color:var(--bad); }
  .mcell .m { font-size:10px; color:var(--mute); }
  .lib { display:grid; grid-template-columns:1fr; gap:14px; }
  table.t { width:100%; border-collapse:collapse; font-size:13px; margin-top:6px; }
  .t th { text-align:left; font-weight:500; color:var(--mute); padding:6px 8px 8px 0; border-bottom:1px solid var(--line); font-size:12px; }
  .t td { padding:9px 8px 9px 0; border-bottom:1px solid var(--line2); vertical-align:top; }
  .t select,.t input { font:inherit; font-size:13px; border:0; background:none; padding:0; color:var(--ink); }
  .t input { border-bottom:1px solid var(--line); padding:2px 0; }
  .t input:focus { outline:none; border-bottom-color:var(--acc); }
  .warn { font-size:13px; color:var(--bad); background:var(--bad-soft); padding:10px 14px; border-radius:10px; margin-bottom:12px; line-height:1.45; }
  .hint { font-size:12px; color:var(--mute); line-height:1.5; }
  .insights { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:12px; margin-top:16px; }
  .insight { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px 16px; font-size:13px; line-height:1.5; }
  .insight b { display:block; font-weight:500; margin-bottom:4px; }
  .insight.up { border-left:3px solid var(--acc); }
  .insight.down { border-left:3px solid var(--bad); }
  .insight.flat { border-left:3px solid var(--line); }
  .btn.xs { padding:5px 10px; font-size:12px; border-radius:8px; display:inline-flex; align-items:center; gap:6px; line-height:1; }
  .btn.xs svg { opacity:.7; }
  .menu-wrap { position:relative; display:inline-flex; }
  .menu { position:absolute; top:calc(100% + 5px); right:0; z-index:20; min-width:210px; background:var(--card); border:1px solid var(--line); border-radius:12px; padding:5px; box-shadow:0 6px 20px var(--shadow); }
  .menu button { display:block; width:100%; text-align:left; border:0; background:none; font:inherit; font-size:13px; color:var(--ink); padding:8px 10px; border-radius:8px; cursor:pointer; }
  .menu button:hover { background:var(--acc-soft); color:var(--acc-ink); }
  .menu button small { display:block; font-size:11px; color:var(--mute); margin-top:2px; }
  .menu button:hover small { color:inherit; opacity:.75; }
  .menu button.cancel { color:var(--mute); border-top:1px solid var(--line2); border-radius:0 0 8px 8px; margin-top:3px; }
  .theme { border:1px solid var(--line); background:var(--card); color:var(--ink2); width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:14px; }
  .theme:hover { border-color:var(--acc); color:var(--acc); }
  @media (max-width:720px) {
    .ht-top { padding:14px 14px 0; }
    .ht-main { padding:12px 14px 50px; }
    .ht-day { grid-template-columns:1fr; }
    .week { grid-template-columns:repeat(2,1fr); }
    .cell { min-height:110px; }
    .mcell { min-height:56px; padding:5px; }
    .mcell .e { font-size:14px; }
    .mcell .m { display:none; }
  }
`;

export default function HealthTracker() {
  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("day");
  const [date, setDate] = useState(today());
  const [msg, setMsg] = useState("");
  const [dark, setDark] = useState(false);
  const [storageOk, setStorageOk] = useState(null);

  useEffect(() => {
    (async () => {
      try { if ((await store.pref("theme")) === "dark") setDark(true); } catch (e) {}
      try {
        setStorageOk(!!(await store.pref("probe", String(Date.now()))));
      } catch (e) { setStorageOk(false); }
      try { const d = await store.load(); if (d) setData(d); } catch (e) {}
      setLoaded(true);
    })();
  }, []);

  const save = async (next) => {
    setData(next);
    try {
      await store.saveAll(next);
      setStorageOk(true); setMsg("Saved"); setTimeout(() => setMsg(""), 1200);
    } catch (e) { setStorageOk(false); setMsg("Not saved — storage isn't available here"); }
  };

  const openWindow = useMemo(() => {
    const i = data.interventions.find((x) => x.status === "testing");
    if (i) return { name: i.name, start: i.start };
    const f = data.foods.find((x) => x.status === "testing");
    if (f) return { name: f.name, start: f.lastTested };
    return null;
  }, [data]);
  const dayN = openWindow?.start ? Math.max(1, Math.round((new Date(today()) - new Date(openWindow.start)) / 864e5) + 1) : null;

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `pathways-${today()}.json`; a.click();
  };

  const importRef = useRef();
  const importJSON = (file) => {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = migrate(JSON.parse(rd.result));
        if (!d || typeof d !== "object" || !Array.isArray(d.entries)) throw new Error();
        // Last-write-wins by updatedAt — the same rule a server sync will use.
        const merge = (mine, theirs, key) => {
          const by = new Map(mine.map((x) => [x[key], x]));
          (theirs || []).forEach((t) => { const m = by.get(t[key]); if (!m || (t.updatedAt || "") > (m.updatedAt || "")) by.set(t[key], t); });
          return [...by.values()];
        };
        save({
          entries: merge(data.entries, d.entries || [], "date").sort((x, y) => x.date.localeCompare(y.date)),
          foods: merge(data.foods, d.foods || [], "id"),
          interventions: merge(data.interventions, d.interventions || [], "id"),
          meals: d.meals?.length ? d.meals : data.meals,
        });
        setMsg(`Imported ${(d.entries || []).length} days`);
      } catch (e) { setMsg("That file doesn't look like an export from this app"); }
    };
    rd.readAsText(file);
  };
  const goDay = (d) => { setDate(d); setView("day"); };
  const toggleTheme = async () => { const n = !dark; setDark(n); try { await store.pref("theme", n ? "dark" : "light"); } catch (e) {} };

  if (!loaded) return <div className="ht" style={{ padding: 30, color: "#8C8C8C" }}>Opening Pathways…</div>;

  return (
    <div className={"ht" + (dark ? " dark" : "")}>
      <style>{css}</style>
      <header className="ht-top">
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span className="brand">Pathways</span><h1>Health log</h1></div>
        <div className="ht-tabs">
          {[["day","Day"],["week","Week"],["month","Month"],["library","Foods & supplements"],["trends","Trends & insights"]].map(([k,l]) => (
            <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
        <span className="ht-spacer" />
        {msg && <span className="hint">{msg}</span>}
        {storageOk === false && !msg && <span className="hint" style={{ color: "var(--bad)" }}>Storage unavailable — data won't persist. Export before you leave.</span>}
        {storageOk === true && !msg && <span className="hint">Storage connected</span>}
        <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; }} />
        <button className="ht-link" onClick={() => importRef.current.click()}>Import</button>
        <button className="ht-link" onClick={exportJSON}>Export</button>
        <button className="theme" onClick={toggleTheme} title={dark ? "Light mode" : "Dark mode"}>{dark ? "☀" : "☾"}</button>
      </header>
      <main className="ht-main">
        <div className={"ht-status" + (openWindow ? "" : " clear")}>
          <span className="dot" />
          {openWindow ? <span>Testing <b>{openWindow.name}</b> — day {dayN}. Hold everything else steady until you call it.</span>
                      : <span>No open test. You're at baseline — a clean starting point for one change.</span>}
        </div>
        {view === "day" && <Day data={data} save={save} date={date} setDate={setDate} />}
        {view === "week" && <Week data={data} date={date} setDate={setDate} goDay={goDay} />}
        {view === "month" && <Month data={data} save={save} date={date} setDate={setDate} goDay={goDay} />}
        {view === "library" && <Library data={data} save={save} openWindow={openWindow} />}
        {view === "trends" && <Trends data={data} dark={dark} />}
      </main>
    </div>
  );
}

/* ---------------- Day ---------------- */
function Day({ data, save, date, setDate }) {
  const existing = data.entries.find((e) => e.date === date);
  const [f, setF] = useState(null);
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
          <button className="btn" onClick={submit} disabled={f.energy == null}>{isLogged ? "Update" : "Save today"}</button>
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

/* ---------------- Week ---------------- */
function Week({ data, date, setDate, goDay }) {
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
              {testingOn(data, ds) && <span className="meta" style={{ color: "var(--acc-ink)" }}>Testing {testingOn(data, ds)}</span>}
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

/* ---------------- Month ---------------- */
function Month({ data, save, date, setDate, goDay }) {
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

/* ---------------- Library: Foods + Interventions ---------------- */
function Library({ data, save, openWindow }) {
  return (
    <div className="lib">
      <Interventions data={data} save={save} openWindow={openWindow} />
      <Foods data={data} save={save} openWindow={openWindow} />
    </div>
  );
}

function Foods({ data, save, openWindow }) {
  const blank = { name: "", category: "", status: "unknown", confidence: "low", lastTested: "" };
  const [f, setF] = useState(blank);
  const [warn, setWarn] = useState("");
  const [adding, setAdding] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const block = (name) => setWarn(`${openWindow.name} is already being tested. Two changes at once means neither result can be trusted — close that one first.`);
  const add = () => {
    if (!f.name.trim()) return;
    if (f.status === "testing" && openWindow) return block();
    setWarn("");
    save({ ...data, foods: [...data.foods, { ...f, id: uid(), lastTested: f.lastTested || (f.status === "testing" ? today() : "") }] });
    setF(blank); setAdding(false);
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

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ flex: 1 }}>Foods</h3>
        <button className="btn ghost sm" onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "Add food"}</button>
      </div>
      {warn && <p className="warn">{warn}</p>}
      {adding && <div style={{ background: "var(--bg2)", borderRadius: 12, padding: "12px 14px 4px", margin: "8px 0 12px" }}>
        <div className="ht-row">
          <div className="ht-field">Food<input value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="White rice" autoFocus /></div>
          <div className="ht-field">Category<input value={f.category} onChange={(e) => set("category", e.target.value)} placeholder="Grain" /></div>
          <div className="ht-field">Status<select value={f.status} onChange={(e) => set("status", e.target.value)}>{FOOD_STATUS.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="ht-field">Confidence<select value={f.confidence} onChange={(e) => set("confidence", e.target.value)}>{CONFIDENCE.map((s) => <option key={s}>{s}</option>)}</select></div>
          <div className="ht-field">Last tested<input type="date" value={f.lastTested} onChange={(e) => set("lastTested", e.target.value)} /></div>
        </div>
        <button className="btn sm" onClick={add} style={{ marginBottom: 10 }}>Save food</button>
      </div>}
      {sorted.length === 0 ? <p className="empty">Nothing here yet. Start with the foods you already know are safe — that's your baseline.</p> : (
        <table className="t"><thead><tr><th>Food</th><th>Category</th><th>Status</th><th>Confidence</th><th>Last tested</th><th></th></tr></thead>
          <tbody>{sorted.map((x) => (
            <tr key={x.id}>
              <td>{x.name}</td><td style={{ color: "var(--mute)" }}>{x.category || "—"}</td>
              <td><select value={x.status} onChange={(e) => setStatus(x.id, e.target.value)} className={`pill ${x.status.replace(" ", "-")}`}>{FOOD_STATUS.map((s) => <option key={s}>{s}</option>)}</select></td>
              <td>{x.confidence}</td><td>{x.lastTested || "—"}</td>
              <td><button className="ht-link" onClick={() => remove(x.id)}>Remove</button></td>
            </tr>
          ))}</tbody></table>
      )}
    </div>
  );
}

function Interventions({ data, save, openWindow }) {
  const blank = { name: "", type: "supplement", dose: "", start: today(), end: "", source: "", status: "baseline", outcome: "" };
  const [f, setF] = useState(blank);
  const [warn, setWarn] = useState("");
  const [adding, setAdding] = useState(false);
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));
  const block = () => setWarn(`${openWindow.name} is already being tested. One open test at a time — otherwise you won't know which change did what.`);
  const add = () => {
    if (!f.name.trim()) return;
    if (f.status === "testing" && openWindow) return block();
    setWarn("");
    save({ ...data, interventions: [...data.interventions, { ...f, id: uid() }] });
    setF(blank); setAdding(false);
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

  return (
    <div className="card">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <h3 style={{ flex: 1 }}>Supplements & treatments <span className="hint" style={{ fontWeight: 400 }}>· {onCount} on</span></h3>
        <button className="btn ghost sm" onClick={() => setAdding(!adding)}>{adding ? "Cancel" : "Add"}</button>
      </div>
      {warn && <p className="warn">{warn}</p>}
      {adding && <div style={{ background: "var(--bg2)", borderRadius: 12, padding: "12px 14px 4px", margin: "8px 0 12px" }}>
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
        <button className="btn sm" onClick={add} style={{ marginBottom: 10 }}>Save</button>
      </div>}
      {sorted.length === 0 ? <p className="empty">Add everything you currently take as <i>baseline</i> first, so the trends chart has context.</p> : (
        <table className="t"><thead><tr><th>On</th><th>Name</th><th>Type</th><th>Dose</th><th>Start</th><th>End</th><th>From</th><th>Status</th><th>Outcome</th><th></th></tr></thead>
          <tbody>{sorted.map((x) => (
            <tr key={x.id} className={isOn(x) ? "" : "off"}>
              <td><button className={"switch" + (isOn(x) ? " on" : "")} onClick={() => toggleOn(x)} title={isOn(x) ? "Taking — switch off" : "Not taking — switch on"} /></td>
              <td>{x.name}</td><td style={{ color: "var(--mute)" }}>{x.type}</td><td>{x.dose || "—"}</td><td>{x.start || "—"}</td>
              <td><input type="date" value={x.end || ""} onChange={(e) => update(x.id, { end: e.target.value })} style={{ width: 118 }} /></td>
              <td style={{ color: "var(--mute)" }}>{x.source || "—"}</td>
              <td><select value={x.status} onChange={(e) => update(x.id, { status: e.target.value })} className={`pill ${x.status}`}>{INT_STATUS.map((s) => <option key={s}>{s}</option>)}</select></td>
              <td><input value={x.outcome || ""} onChange={(e) => update(x.id, { outcome: e.target.value })} placeholder="What happened" style={{ width: 130 }} /></td>
              <td><button className="ht-link" onClick={() => remove(x.id)}>Remove</button></td>
            </tr>
          ))}</tbody></table>
      )}
    </div>
  );
}

/* ---------------- Trends & insights ---------------- */
function Trends({ data, dark }) {
  const c = dark ? { ink:"#ECECEC", mute:"#7C7C7C", grid:"#262626", card:"#1E1E1E", line:"#2E2E2E", acc:"#6F6688", bad:"#E08A7C", disc:"#555" } : { ink:"#161616", mute:"#8C8C8C", grid:"#EFEFEF", card:"#FFFFFF", line:"#E4E4E4", acc:"#6B6480", bad:"#9A3B2E", disc:"#BDBDBD" };
  const rows = data.entries.filter(logged).map((e) => ({ date: e.date, energy: e.energy, inflammation: e.inflammation ?? null, flare: e.flare ? e.severity : null }));
  const windows = data.interventions.filter((i) => i.start && i.status !== "baseline").map((i) => ({ ...i, end: i.end || today() }));
  const fill = { testing: c.acc, established: c.acc, discontinued: c.disc };
  const insights = useMemo(() => buildInsights(data), [data]);

  return (
    <>
      <div className="ht-nav"><h2>Trends & insights</h2></div>
      {rows.length < 2 ? <div className="card"><p className="empty">Two or more logged days and the chart shows up here. Give it two weeks before reading anything into it.</p></div> : (
        <div className="card">
          <p className="hint" style={{ marginTop: 0 }}>Energy solid, inflammation dashed. Red dots are flare days, bigger is worse. Shaded bands are tests.</p>
          <div style={{ height: 300, fontSize: 12 }}>
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke={c.mute} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 10]} stroke={c.mute} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${c.line}`, background: c.card, color: c.ink, fontSize: 12 }} />
                {windows.map((w) => <ReferenceArea key={w.id} x1={w.start} x2={w.end} fill={fill[w.status]} fillOpacity={dark ? 0.22 : 0.12} label={{ value: w.name, position: "insideTopLeft", fontSize: 11, fill: c.mute }} />)}
                <Line type="monotone" dataKey="energy" stroke={c.ink} strokeWidth={2} isAnimationActive={false}
                  dot={(p) => p.payload.flare ? <circle key={p.payload.date} cx={p.cx} cy={p.cy} r={3 + p.payload.flare} fill={c.bad} /> : <circle key={p.payload.date} cx={p.cx} cy={p.cy} r={2.5} fill={c.ink} />} />
                <Line type="monotone" dataKey="inflammation" stroke={c.mute} strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
      <div className="insights">
        {insights.map((x, i) => <div key={i} className={"insight " + x.tone}><b>{x.title}</b>{x.body}</div>)}
      </div>
    </>
  );
}

function buildInsights(data) {
  const out = [];
  const E = data.entries.filter(logged);
  const n = E.length;
  const avg = (a) => a.length ? a.reduce((s, e) => s + e.energy, 0) / a.length : null;
  const flareRate = (a) => a.length ? a.filter((e) => e.flare).length / a.length : null;
  const inf = (a) => { const b = a.filter((e) => e.inflammation != null); return b.length ? b.reduce((s, e) => s + e.inflammation, 0) / b.length : null; };
  const infTxt = (a, b) => (inf(a) != null && inf(b) != null) ? ` Inflammation ${inf(a).toFixed(1)} vs ${inf(b).toFixed(1)}.` : "";
  const inRange = (s, e) => E.filter((x) => x.date >= s && x.date <= e);

  if (n === 0) { out.push({ tone: "flat", title: "Nothing to read yet", body: "Insights appear once there's data. The first two weeks are baseline — the goal is to see what a normal week looks like before changing anything." }); return out; }
  if (n < 7) { out.push({ tone: "flat", title: `${n} day${n > 1 ? "s" : ""} logged`, body: "Too early to draw anything. A week of entries gives a rough baseline; two weeks is when patterns start to be worth looking at." }); }

  // Recent vs earlier
  if (n >= 14) {
    const last = E.slice(-7), prev = E.slice(-14, -7);
    const d = avg(last) - avg(prev);
    const tone = d > 0.7 ? "up" : d < -0.7 ? "down" : "flat";
    out.push({ tone, title: "This week vs last week", body: `Average energy ${avg(last).toFixed(1)} vs ${avg(prev).toFixed(1)}. ${tone === "flat" ? "About the same — that's a stable baseline, which is what you want before testing something." : tone === "up" ? "Better. Check the notes from this week for what might explain it." : "Lower. Look at what was different — the notes column is where the answer usually is."} Flare days: ${last.filter((e) => e.flare).length} vs ${prev.filter((e) => e.flare).length}.${infTxt(last, prev)}` });
  }

  // Each tested intervention
  data.interventions.filter((i) => i.start && ["testing", "established", "discontinued"].includes(i.status)).forEach((i) => {
    const end = i.end || today();
    const inside = inRange(i.start, end);
    const before = inRange(addDays(i.start, -14), addDays(i.start, -1));
    if (inside.length < 5) { out.push({ tone: "flat", title: i.name, body: `${inside.length} day${inside.length === 1 ? "" : "s"} of data inside this window. Five is the minimum before comparing; ten to fourteen is better.` }); return; }
    if (before.length < 5) { out.push({ tone: "flat", title: i.name, body: `${inside.length} days logged during, but fewer than 5 days logged before it started — no baseline to compare against. The comparison would be meaningless.` }); return; }
    const d = avg(inside) - avg(before);
    const fd = flareRate(inside) - flareRate(before);
    const tone = d > 0.8 ? "up" : d < -0.8 ? "down" : "flat";
    out.push({ tone, title: `${i.name} (${inside.length} days)`, body: `Energy averaged ${avg(inside).toFixed(1)} during vs ${avg(before).toFixed(1)} in the two weeks before. ${tone === "up" ? "That's a real-looking difference — worth keeping, but one window isn't proof." : tone === "down" ? "Lower than before. If nothing else changed, that's a signal to stop and see if it recovers." : "No clear difference. That's a valid result — it means this one probably isn't doing much either way."} Flare days: ${Math.round(flareRate(inside) * 100)}% vs ${Math.round(flareRate(before) * 100)}%${Math.abs(fd) > 0.15 ? (fd < 0 ? " — fewer, which matters more than the energy number." : " — more, which matters more than the energy number.") : "."}${infTxt(inside, before)}` });
  });

  // Day of week
  if (n >= 21) {
    const by = {};
    E.forEach((e) => { const d = new Date(e.date + "T12:00:00").getDay(); (by[d] ||= []).push(e); });
    const names = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const ranked = Object.entries(by).filter(([, a]) => a.length >= 3).map(([d, a]) => [names[d], avg(a)]).sort((a, b) => b[1] - a[1]);
    if (ranked.length >= 4 && ranked[0][1] - ranked[ranked.length - 1][1] >= 1.2) {
      out.push({ tone: "flat", title: "Day-of-week pattern", body: `${ranked[0][0]}s average ${ranked[0][1].toFixed(1)}, ${ranked[ranked.length-1][0]}s ${ranked[ranked.length-1][1].toFixed(1)}. A gap that size usually points to something in the weekly rhythm — work, church, physical labor, or what you eat on those days.` });
    }
  }

  // Activity -> next day
  if (n >= 14) {
    const byDate = Object.fromEntries(E.map((e) => [e.date, e]));
    const after = (lvl) => E.filter((e) => e.activity === lvl).map((e) => byDate[addDays(e.date, 1)]).filter(Boolean);
    const hard = after("hard"), mod = after("moderate"), rest = [...after("rest"), ...after("light")];
    if (hard.length >= 3 && rest.length >= 3) {
      const d = avg(hard) - avg(rest);
      const tone = d < -1 ? "down" : d > 0.5 ? "up" : "flat";
      out.push({ tone, title: "Day after hard activity", body: `Energy averages ${avg(hard).toFixed(1)} the day after a hard day, vs ${avg(rest).toFixed(1)} after rest or light days${mod.length >= 3 ? `, ${avg(mod).toFixed(1)} after moderate` : ""}. ${tone === "down" ? "That's a post-exertion pattern. The useful question isn't whether to stop — it's where the ceiling is. Moderate days are the place to look." : tone === "up" ? "Hard days seem to help rather than cost you. Worth trusting, carefully." : "No clear next-day cost from hard activity. Keep an eye on it as the sample grows."}` });
    }
  }

  // Regimen adherence
  const withReg = E.map((e) => ({ e, a: adherence(data, e, e.date) })).filter((x) => x.a);
  if (withReg.length >= 7) {
    const last14 = withReg.slice(-14);
    const pct = Math.round(100 * last14.reduce((s, x) => s + x.a.taken, 0) / last14.reduce((s, x) => s + x.a.due, 0));
    const full = withReg.filter((x) => x.a.taken === x.a.due).map((x) => x.e);
    const missed = withReg.filter((x) => x.a.taken < x.a.due).map((x) => x.e);
    let body = `${pct}% of doses taken over the last ${last14.length} logged days.`;
    let tone = "flat";
    if (full.length >= 4 && missed.length >= 4) {
      const d = avg(full) - avg(missed);
      tone = d > 0.8 ? "up" : d < -0.8 ? "down" : "flat";
      body += ` Full-regimen days average ${avg(full).toFixed(1)} energy vs ${avg(missed).toFixed(1)} on days something was missed.${infTxt(full, missed)}`;
      body += tone === "up" ? " The regimen is doing something — or the days you skip it are already bad days. Notes will tell you which." : tone === "down" ? " Days you miss things are actually better. Worth asking whether something in the stack is costing you." : " No visible difference between full and partial days.";
    } else if (missed.length < 4) {
      body += " Not enough missed days to compare — which is fine, that's consistency.";
    }
    out.push({ tone, title: "Regimen", body });

    // per-supplement missed vs taken
    const byDate = Object.fromEntries(E.map((e) => [e.date, e]));
    data.interventions.filter((i) => i.type !== "lifestyle").forEach((i) => {
      const days = E.filter((e) => i.start && i.start <= e.date && (!i.end || i.end >= e.date));
      const took = days.filter((e) => e.taken?.includes(i.id)), skip = days.filter((e) => !e.taken?.includes(i.id));
      if (took.length < 4 || skip.length < 3) return;
      const nextAfter = (arr) => arr.map((e) => byDate[addDays(e.date, 1)]).filter(Boolean);
      const ta = nextAfter(took), sa = nextAfter(skip);
      const same = avg(took) - avg(skip);
      const next = (ta.length >= 3 && sa.length >= 3) ? avg(ta) - avg(sa) : null;
      const tone = same > 0.8 || (next != null && next > 0.8) ? "up" : same < -0.8 || (next != null && next < -0.8) ? "down" : "flat";
      out.push({ tone, title: `${i.name} — taken vs missed`, body: `Missed ${skip.length} of ${days.length} days. Energy ${avg(took).toFixed(1)} on days taken vs ${avg(skip).toFixed(1)} on days missed${next != null ? `; the following day ${avg(ta).toFixed(1)} vs ${avg(sa).toFixed(1)}` : ""}.${infTxt(took, skip)} ${tone === "up" ? "Missing it seems to cost you." : tone === "down" ? "You do better without it. That's worth a deliberate test — switch it off for two weeks and watch." : "Missing it doesn't seem to move anything."}` });
    });
  }

  // Meal plan adherence
  const withMeals = E.map((e) => ({ e, m: mealsOn(data, e, e.date) })).filter((x) => x.m);
  if (withMeals.length >= 7) {
    const onPlan = withMeals.filter((x) => x.m.eaten === x.m.planned).map((x) => x.e);
    const offPlan = withMeals.filter((x) => x.m.eaten < x.m.planned).map((x) => x.e);
    const pct = Math.round(100 * withMeals.reduce((s, x) => s + x.m.eaten, 0) / withMeals.reduce((s, x) => s + x.m.planned, 0));
    let tone = "flat", body = `${pct}% of planned meals eaten across ${withMeals.length} logged days.`;
    if (onPlan.length >= 4 && offPlan.length >= 4) {
      const d = avg(onPlan) - avg(offPlan);
      tone = d > 0.8 ? "up" : d < -0.8 ? "down" : "flat";
      body += ` On-plan days average ${avg(onPlan).toFixed(1)} energy vs ${avg(offPlan).toFixed(1)} when meals were skipped or swapped.${infTxt(onPlan, offPlan)}`;
      body += tone === "up" ? " The plan is earning its keep. Off-plan days with notes will show which swaps cost the most." : tone === "down" ? " Off-plan days are better. Either the plan has something in it that doesn't suit you, or you go off-plan on easy days. Check the notes." : " No clear difference — which might mean the plan is fine but not the lever.";
    } else if (offPlan.length < 4) body += " Nearly always on plan — no comparison possible yet.";
    out.push({ tone, title: "Meal plan", body });
  }

  // Unplanned food -> next day
  const withExtras = E.filter((e) => (e.extras || []).length > 0);
  if (withExtras.length >= 5 && n >= 14) {
    const byD = Object.fromEntries(E.map((e) => [e.date, e]));
    const after = (arr) => arr.map((e) => byD[addDays(e.date, 1)]).filter(Boolean);
    const clean = E.filter((e) => !(e.extras || []).length);
    const xa = after(withExtras), ca = after(clean);
    if (xa.length >= 4 && ca.length >= 4) {
      const d = avg(xa) - avg(ca);
      const tone = d < -0.8 ? "down" : d > 0.8 ? "up" : "flat";
      out.push({ tone, title: "Day after unplanned food", body: `Energy averages ${avg(xa).toFixed(1)} the day after you logged something off-plan, vs ${avg(ca).toFixed(1)} after clean days.${infTxt(xa, ca)} ${tone === "down" ? "Something in the extras costs you the next day. Read those entries side by side — the repeated ingredient is the suspect." : tone === "up" ? "Extras aren't hurting — if anything the opposite. The plan might be missing something you need." : "No next-day pattern from unplanned food so far."}` });
    }
  }

  // Repeated unplanned items, flagged against the foods list
  {
    const byD = Object.fromEntries(E.map((e) => [e.date, e]));
    const items = {};
    E.forEach((e) => (e.extras || []).forEach((m) => { const k = m.items.toLowerCase().trim(); (items[k] ||= []).push(e.date); }));
    const repeats = Object.entries(items).filter(([, ds]) => ds.length >= 3);
    if (repeats.length && n >= 14) {
      const lines = repeats.map(([k, ds]) => {
        const next = ds.map((d) => byD[addDays(d, 1)]).filter(Boolean);
        const others = E.filter((e) => !ds.includes(e.date));
        const dI = (next.length >= 3 && inf(next) != null && inf(others) != null) ? inf(next) - inf(others) : null;
        const flag = data.foods.some((fd) => fd.status === "not tolerated" && k.includes(fd.name.toLowerCase()));
        return `${k} (${ds.length}×)${dI != null ? `: inflammation ${dI > 0 ? "+" : ""}${dI.toFixed(1)} next day` : ""}${flag ? " — includes something marked not tolerated" : ""}`;
      });
      const flagged = lines.some((l) => l.includes("not tolerated"));
      out.push({ tone: flagged ? "down" : "flat", title: "Foods you keep logging off-plan", body: lines.join(". ") + ". Under about 1 point is noise at this sample size." });
    }
  }

  // Workout plan
  const withWo = E.map((e) => ({ e, w: workoutsOn(data, e, e.date) })).filter((x) => x.w?.planned);
  if (withWo.length >= 7) {
    const doneN = withWo.reduce((s, x) => s + x.w.done, 0), planN = withWo.reduce((s, x) => s + x.w.planned, 0);
    const skipped = withWo.filter((x) => x.w.skip > 0);
    const full = withWo.filter((x) => x.w.done === x.w.planned).map((x) => x.e);
    let body = `${Math.round(100 * doneN / planN)}% of planned workouts completed across ${withWo.length} days${skipped.length ? `, with something skipped on ${skipped.length}` : ""}.`;
    if (skipped.length >= 3) {
      const sd = skipped.map((x) => x.e);
      body += ` Energy on days you skipped averaged ${avg(sd).toFixed(1)}${full.length >= 3 ? ` vs ${avg(full).toFixed(1)} on days you completed the plan` : ""}.`;
      if (full.length >= 3) body += avg(sd) < avg(full) - 0.8 ? " You're skipping on low days — that's the plan bending to the body, which is how it should work." : avg(sd) > avg(full) + 0.8 ? " You're skipping on good days, which usually means something other than symptoms is getting in the way." : " Skips don't track with how you felt. Worth asking what actually drives them.";
    }
    out.push({ tone: "flat", title: "Workout plan", body });

    const byDw = Object.fromEntries(E.map((e) => [e.date, e]));
    const afterW = (arr) => arr.map((e) => byDw[addDays(e.date, 1)]).filter(Boolean);
    const fa = afterW(full), sa = afterW(skipped.map((x) => x.e));
    if (fa.length >= 4 && sa.length >= 4) {
      const d = avg(fa) - avg(sa);
      const t2 = d < -0.8 ? "down" : d > 0.8 ? "up" : "flat";
      out.push({ tone: t2, title: "Day after completing the plan", body: `Energy ${avg(fa).toFixed(1)} the day after a full workout day, vs ${avg(sa).toFixed(1)} after a day you scaled back.${infTxt(fa, sa)} ${t2 === "down" ? "The plan is above your ceiling right now. That doesn't mean stop — it means the next version should be smaller, built up from what you can repeat." : t2 === "up" ? "Full days aren't costing you the next day. Room to hold steady or add slowly." : "No clear next-day difference. Steady ground."}` });
    }
  }

  // Flares and notes
  const flares = E.filter((e) => e.flare);
  if (flares.length >= 3) {
    const noted = flares.filter((e) => e.notes?.trim()).length;
    out.push({ tone: "flat", title: `${flares.length} flare days so far`, body: noted < flares.length ? `${flares.length - noted} of them have no notes. Flare days with notes are the most valuable entries you have — even "nothing was different" is useful.` : "Every flare has a note. Read them together sometime — the repeated word is usually the lead." });
  }

  // Food status summary
  const nt = data.foods.filter((x) => x.status === "not tolerated"), unk = data.foods.filter((x) => x.status === "unknown");
  if (data.foods.length >= 5) out.push({ tone: "flat", title: "Foods", body: `${data.foods.filter((x) => x.status === "tolerated").length} tolerated, ${nt.length} not, ${unk.length} untested. ${unk.length > 0 ? "Untested foods are your test queue — one at a time, three or four days each, only when nothing else is open." : "No untested foods left in the list."}` });

  return out;
}
