import { useState, useEffect, useMemo, useRef } from "react";
import { supabase } from "./lib/supabase.js";
import { today, EMPTY, migrate } from "./lib/utils.js";
import { store } from "./lib/store.js";
import { css } from "./styles.js";
import Auth from "./components/Auth.jsx";
import Day from "./components/Day.jsx";
import Week from "./components/Week.jsx";
import Month from "./components/Month.jsx";
import Library from "./components/Library.jsx";
import Trends from "./components/Trends.jsx";

// The gate. Nothing below renders until Supabase says who is signed in.
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (session === undefined) return <div className="ht" style={{ padding: 30, color: "#8C8C8C" }}>Opening Pathways…</div>;
  if (!session) return <Auth />;
  // key= remounts the tracker if the user changes, so no state leaks between accounts.
  return <HealthTracker key={session.user.id} session={session} />;
}

function HealthTracker({ session }) {
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
      try { const d = await store.load(); if (d) setData(d); setStorageOk(true); }
      catch (e) { console.error(e); setStorageOk(false); }
      setLoaded(true);
    })();
  }, []);

  const save = async (next) => {
    setData(next);
    try {
      await store.saveAll(next);
      setStorageOk(true); setMsg("Saved"); setTimeout(() => setMsg(""), 1200);
    } catch (e) { setStorageOk(false); setMsg(`Not saved — ${e.message || "database unreachable"}`); }
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
          workouts: d.workouts?.length ? d.workouts : (data.workouts || []),
        });
        setMsg(`Imported ${(d.entries || []).length} days`);
      } catch (e) { setMsg("That file doesn't look like an export from this app"); }
    };
    rd.readAsText(file);
  };
  const goDay = (d) => { setDate(d); setView("day"); };
  const toggleTheme = async () => { const n = !dark; setDark(n); try { await store.pref("theme", n ? "dark" : "light"); } catch (e) {} };
  const signOut = () => supabase.auth.signOut();

  if (!loaded) return <div className="ht" style={{ padding: 30, color: "#8C8C8C" }}>Opening Pathways…</div>;

  return (
    <div className={"ht" + (dark ? " dark" : "")}>
      <style>{css}</style>
      <header className="ht-top">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}><img className="brand-logo" src="/logo.png" alt="" /><span className="brand">Pathways</span><h1>Health log</h1></div>
        <div className="ht-tabs">
          {[["day","Day"],["week","Week"],["month","Month"],["library","Foods & supplements"],["trends","Trends & insights"]].map(([k,l]) => (
            <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
        <span className="ht-spacer" />
        {msg && <span className="hint">{msg}</span>}
        {storageOk === false && !msg && <span className="hint" style={{ color: "var(--bad)" }}>Can't reach the database — changes won't save. Export before you leave.</span>}
        {storageOk === true && !msg && <span className="hint">Connected</span>}
        <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; }} />
        <button className="ht-link" onClick={() => importRef.current.click()}>Import</button>
        <button className="ht-link" onClick={exportJSON}>Export</button>
        <button className="ht-link" onClick={signOut} title={session.user.email}>Sign out</button>
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
