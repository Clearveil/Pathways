import { useState, useEffect, useMemo, useRef } from "react";
import { supabase, LOCAL_ONLY, CONFIG_ERROR } from "./lib/supabase.js";
import { today, EMPTY, migrate } from "./lib/utils.js";
import { store } from "./lib/store.js";
import { css } from "./styles.js";
import Auth from "./components/Auth.jsx";
import Day from "./components/Day.jsx";
import Week from "./components/Week.jsx";
import Month from "./components/Month.jsx";
import Library from "./components/Library.jsx";
import Trends from "./components/Trends.jsx";
import Menu from "./components/Menu.jsx";
import Modal from "./components/Modal.jsx";
import { Share, Sun, Moon, User, CloudCheck, CloudOff, Check, Drive, Upload, Download } from "./components/Icons.jsx";

// The gate. Nothing below renders until Supabase says who is signed in.
export default function App() {
  const [session, setSession] = useState(undefined); // undefined = still checking
  useEffect(() => {
    if (LOCAL_ONLY) { setSession({ user: { id: "local", email: "browser-only mode" } }); return; }
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (CONFIG_ERROR) return <div className="ht" style={{ padding: 30, maxWidth: 560, lineHeight: 1.5 }}><h2 style={{ marginTop: 0 }}>Pathways can't start</h2><p>{CONFIG_ERROR}</p></div>;
  if (session === undefined) return <div className="ht" style={{ padding: 30, color: "#8C8C8C" }}>Opening Pathways…</div>;
  if (!session) return <Auth />;
  // key= remounts the tracker if the user changes, so no state leaks between accounts.
  return <HealthTracker key={session.user.id} session={session} />;
}

const PLAN_LABEL = { free: "Free", pro: "Pro" };

function HealthTracker({ session }) {
  const [data, setData] = useState(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState("day");
  const [date, setDate] = useState(today());
  const [msg, setMsg] = useState("");
  const [dark, setDark] = useState(false);
  const [storageOk, setStorageOk] = useState(null);
  const [plan, setPlan] = useState("free");
  const [showPlan, setShowPlan] = useState(false);

  useEffect(() => {
    (async () => {
      try { if ((await store.pref("theme")) === "dark") setDark(true); } catch (e) {}
      try { const d = await store.load(); if (d) setData(d); setStorageOk(true); }
      catch (e) { console.error(e); setStorageOk(false); }
      try { const p = await store.profile(); if (p?.plan) setPlan(p.plan); } catch (e) {}
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
  const pickImport = () => importRef.current.click();
  const goDay = (d) => { setDate(d); setView("day"); };
  const toggleTheme = async () => { const n = !dark; setDark(n); try { await store.pref("theme", n ? "dark" : "light"); } catch (e) {} };
  const signOut = () => { if (supabase) supabase.auth.signOut(); };

  if (!loaded) return <div className="ht" style={{ padding: 30, color: "#8C8C8C" }}>Opening Pathways…</div>;

  // Connection state, as text on desktop and as an icon on phones.
  const statusText = storageOk === false ? "Can't reach the database — changes won't save. Export before you leave." : LOCAL_ONLY ? "Browser-only mode" : "Connected";
  const StatusIcon = storageOk === false ? CloudOff : msg === "Saved" ? Check : LOCAL_ONLY ? Drive : CloudCheck;

  return (
    <div className={"ht" + (dark ? " dark" : "")}>
      <style>{css}</style>
      <header className="ht-top">
        <div className="ht-brand">
          <img className="brand-logo" src="/logo.png" alt="" />
          <span className="brand">Pathways</span>
          <h1>Health log</h1>
        </div>
        <div className="ht-tabs">
          {[["day","Day","Day"],["week","Week","Week"],["month","Month","Month"],["library","Foods & supplements","Foods"],["trends","Trends & insights","Trends"]].map(([k,l,s]) => (
            <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}><span className="full">{l}</span><span className="short">{s}</span></button>
          ))}
        </div>
        <span className="ht-spacer" />
        <div className="ht-actions">
          {msg ? <span className="hint desk-only">{msg}</span>
               : storageOk !== null && <span className="hint desk-only" style={storageOk === false ? { color: "var(--bad)" } : undefined}>{statusText}</span>}
          {storageOk !== null && <span className={"status-icon mob-only" + (storageOk === false ? " bad" : "")} title={msg || statusText}><StatusIcon /></span>}
          <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; }} />
          <button className="ht-link desk-only" onClick={pickImport}>Import</button>
          <button className="ht-link desk-only" onClick={exportJSON}>Export</button>
          <Menu className="mob-only" icon={<Share />} label="Import or export">
            <button onClick={exportJSON}><Download /> Export everything<small>A JSON file of all your data</small></button>
            <button onClick={pickImport}><Upload /> Import<small>A Pathways export (.json)</small></button>
          </Menu>
          <button className="icon-btn" onClick={toggleTheme} title={dark ? "Light mode" : "Dark mode"} aria-label={dark ? "Light mode" : "Dark mode"}>{dark ? <Sun /> : <Moon />}</button>
          {!LOCAL_ONLY && (
            <Menu icon={<User />} text="Account" label="Account">
              <div className="menu-head">{session.user.email}<small>{PLAN_LABEL[plan] || plan} plan</small></div>
              <button onClick={() => setShowPlan(true)}>View plan</button>
              <button onClick={signOut}>Sign out</button>
            </Menu>
          )}
        </div>
      </header>
      {msg && <p className="ht-msg mob-only">{msg}</p>}
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
      {showPlan && (
        <Modal title="Your plan" onClose={() => setShowPlan(false)}>
          <p style={{ margin: "0 0 6px" }}><b>{PLAN_LABEL[plan] || plan}</b> · {session.user.email}</p>
          <p className="hint" style={{ margin: 0 }}>Pathways is free while it's being built. When billing turns on, it will be $0.99 per person per month. Nothing changes for you until you're asked.</p>
        </Modal>
      )}
    </div>
  );
}
