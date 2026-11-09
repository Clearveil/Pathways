import { useState, useEffect, useMemo, useRef } from "react";
import { supabase, LOCAL_ONLY, CONFIG_ERROR } from "./lib/supabase.js";
import { today, EMPTY, migrate, KEY } from "./lib/utils.js";
import { store } from "./lib/store.js";
import { css } from "./styles.js";
import Auth from "./components/Auth.jsx";
import Day from "./components/Day.jsx";
import Week from "./components/Week.jsx";
import Month from "./components/Month.jsx";
import Library from "./components/Library.jsx";
import Trends from "./components/Trends.jsx";
import Reports from "./components/Reports.jsx";
import Menu from "./components/Menu.jsx";
import Modal from "./components/Modal.jsx";
import { normalizePhone, formatPhone, MARKETING_CONSENT } from "./lib/phone.js";
import PlanImport from "./components/PlanImport.jsx";
import { Share, Sun, Moon, User, CloudCheck, CloudOff, Check, Drive, Upload, Download, Flask } from "./components/Icons.jsx";

// Last-write-wins merge by updatedAt, never deleting anything. Used for
// importing a backup and for recovering saves that failed while offline.
const mergeData = (base, extra) => {
  const merge = (mine, theirs, key) => {
    const by = new Map((mine || []).map((x) => [x[key], x]));
    (theirs || []).forEach((t) => { const m = by.get(t[key]); if (!m || (t.updatedAt || "") > (m.updatedAt || "")) by.set(t[key], t); });
    return [...by.values()];
  };
  return { ...base,
    entries: merge(base.entries, extra.entries, "date").sort((x, y) => x.date.localeCompare(y.date)),
    foods: merge(base.foods, extra.foods, "id"), interventions: merge(base.interventions, extra.interventions, "id"),
    meals: merge(base.meals, extra.meals, "id"), workouts: merge(base.workouts, extra.workouts, "id") };
};
const UNSYNCED = `${KEY}:unsynced`;

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
  const [profile, setProfile] = useState({});                 // phone, marketing_texts
  const [contact, setContact] = useState(null);               // open "Phone & texts" form state
  const [planImport, setPlanImport] = useState(false);
  const [dataModal, setDataModal] = useState(false);

  const [syncing, setSyncing] = useState(false);
  const pending = useRef(0);      // saves in flight; don't pull while pushing
  const dataRef = useRef(data);   // latest data for the resume listener
  dataRef.current = data;

  // Pull the account's data from the database and replace what's on screen
  // if anything differs. Runs on open, when the app comes back to the
  // foreground, and when the cloud icon is tapped.
  const refresh = async (quiet = false) => {
    if (pending.current > 0) return;
    setSyncing(true);
    try {
      const d = await store.load();
      if (d && JSON.stringify(d) !== JSON.stringify(dataRef.current)) setData(d);
      setStorageOk(true);
      if (!quiet) { setMsg("Up to date"); setTimeout(() => setMsg(""), 1200); }
      setSyncing(false);
      return d;
    } catch (e) { console.error(e); setStorageOk(false); if (!quiet) setMsg(`Couldn't sync — ${e.message || "database unreachable"}`); }
    setSyncing(false);
    return null;
  };

  useEffect(() => {
    (async () => {
      try { if ((await store.pref("theme")) === "dark") setDark(true); } catch (e) {}
      const d = await refresh(true);
      if (!LOCAL_ONLY && d) {
        let pend = null;
        try { pend = JSON.parse(localStorage.getItem(UNSYNCED)); } catch (e) {}
        if (pend) {
          const merged = mergeData(d, migrate(pend));
          setData(merged);
          try { await store.saveAll(merged); localStorage.removeItem(UNSYNCED); setMsg("Recovered changes that hadn't saved"); setTimeout(() => setMsg(""), 2500); } catch (e) {}
        }
      }
      try { const p = await store.profile(); if (p?.plan) setPlan(p.plan); setProfile(p || {}); } catch (e) {}
      setLoaded(true);
    })();
    // A home-screen app is often resumed, not reopened, so the first load
    // can be hours old. Re-sync whenever the app comes back into view.
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 5000) return; // ignore quick flips (share sheet, notifications)
      last = Date.now();
      refresh(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", onVisible); };
  }, []);

  const save = async (next) => {
    const prev = dataRef.current;
    setData(next);
    pending.current += 1;
    try {
      await store.saveAll(next);
      if (!LOCAL_ONLY) localStorage.removeItem(UNSYNCED);
      setStorageOk(true); setMsg("Saved"); setTimeout(() => setMsg(""), 1200);
      if (next.interventions !== prev.interventions || next.foods !== prev.foods || next.entries.length < prev.entries.length) {
        store.loadChanges().then((changes) => setData((d) => ({ ...d, changes }))).catch(() => {});
      }
    } catch (e) {
      // Keep it on this device; it's merged back in and saved next time the app opens.
      if (!LOCAL_ONLY) { try { const { changes, ...rest } = next; localStorage.setItem(UNSYNCED, JSON.stringify(rest)); } catch (e2) {} }
      setStorageOk(false); setMsg(`Not saved yet — kept on this device and retried next time (${e.message || "database unreachable"})`);
    }
    pending.current -= 1;
  };

  const openWindow = useMemo(() => {
    const i = data.interventions.find((x) => x.status === "testing");
    if (i) return { name: i.name, start: i.start };
    const f = data.foods.find((x) => x.status === "testing");
    if (f) return { name: f.name, start: f.lastTested };
    return null;
  }, [data]);
  const dayN = openWindow?.start ? Math.max(1, Math.round((new Date(today()) - new Date(openWindow.start)) / 864e5) + 1) : null;

  const exportJSON = async () => {
    const reports = await store.listReports().catch(() => []);
    const blob = new Blob([JSON.stringify({ ...data, reports }, null, 2)], { type: "application/json" });
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
        save(mergeData(data, d));
        setMsg(`Imported ${(d.entries || []).length} days`);
      } catch (e) { setMsg("That file doesn't look like an export from this app"); }
    };
    rd.readAsText(file);
  };
  const pickImport = () => importRef.current.click();
  const goDay = (d) => { setDate(d); setView("day"); };
  const toggleTheme = async () => { const n = !dark; setDark(n); try { await store.pref("theme", n ? "dark" : "light"); } catch (e) {} };
  // Phone & texts: optional number, and a separate opt-in for marketing
  // texts. Consent time is recorded when it's turned on, cleared when off.
  const openContact = () => setContact({ phone: formatPhone(profile.phone), texts: !!profile.marketing_texts, err: "" });
  const saveContact = async () => {
    const ph = normalizePhone(contact.phone);
    if (!ph.ok) return setContact({ ...contact, err: "That phone number doesn't look right. Use 10 digits, or include the country code with a +." });
    const texts = !!(ph.value && contact.texts);
    const patch = { phone: ph.value, marketing_texts: texts };
    if (texts !== !!profile.marketing_texts) patch.marketing_consent_at = texts ? new Date().toISOString() : null;
    try { await store.updateProfile(patch); setProfile({ ...profile, ...patch }); setContact(null); setMsg("Saved"); setTimeout(() => setMsg(""), 1200); }
    catch (e) { setContact({ ...contact, err: e.message || "Couldn't save." }); }
  };
  const signOut = () => { if (supabase) supabase.auth.signOut(); };

  if (!loaded) return <div className="ht" style={{ padding: 30, color: "#8C8C8C" }}>Opening Pathways…</div>;

  // Connection state, as text on desktop and as an icon on phones.
  const statusText = syncing ? "Syncing…" : storageOk === false ? "Can't reach the database — changes won't save. Export before you leave." : LOCAL_ONLY ? "Browser-only mode" : "Connected";
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
          {[["day","Day","Day"],["week","Week","Week"],["month","Month","Month"],["library","Index","Index"],["trends","Trends & insights","Trends"]].map(([k,l,s]) => (
            <button key={k} className={view === k ? "on" : ""} onClick={() => setView(k)}><span className="full">{l}</span><span className="short">{s}</span></button>
          ))}
        </div>
        <span className="ht-spacer" />
        <div className="ht-actions">
          {storageOk !== null && <button className="ht-link desk-only" onClick={() => refresh()} title="Sync now" style={storageOk === false ? { color: "var(--bad)" } : undefined}>{statusText}</button>}
          {storageOk !== null && <button className={"status-icon mob-only" + (storageOk === false ? " bad" : "") + (syncing ? " syncing" : "")} onClick={() => refresh()} title={syncing ? "Syncing…" : "Tap to sync"} aria-label="Sync now"><StatusIcon /></button>}
          <input ref={importRef} type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; }} />
          <button className="ht-link desk-only" onClick={() => setDataModal(true)}>Import</button>
          <button className="ht-link desk-only" onClick={() => setDataModal(true)}>Export</button>
          <button className="ht-link desk-only" onClick={() => setView("reports")}>Reports</button>
          <Menu className="mob-only" icon={<Share />} label="Import or export">
            <button onClick={exportJSON}><Download /> Export everything<small>A JSON backup of all your data</small></button>
            <button onClick={() => setPlanImport(true)}><Upload /> Import a meal or workout plan<small>CSV, with a guide</small></button>
            <button onClick={pickImport}><Upload /> Restore a backup<small>A .json file exported from Pathways</small></button>
            <button onClick={() => setView("reports")}><Download /> Reports<small>A summary for your doctor or your records</small></button>
          </Menu>
          <button className="icon-btn" onClick={toggleTheme} title={dark ? "Light mode" : "Dark mode"} aria-label={dark ? "Light mode" : "Dark mode"}>{dark ? <Sun /> : <Moon />}</button>
          <Menu icon={<User />} text="Account" label="Account">
            <div className="menu-head">{session.user.email}<small>{PLAN_LABEL[plan] || plan} plan</small></div>
            <button onClick={() => setView("reports")}>Reports<small>Create, reopen or reprint</small></button>
            <button onClick={openContact}>Phone & texts<small>{profile.phone ? formatPhone(profile.phone) + (profile.marketing_texts ? " · texts on" : "") : "Not added"}</small></button>
            {!LOCAL_ONLY && <button onClick={() => setShowPlan(true)}>View plan</button>}
            {!LOCAL_ONLY && <button onClick={signOut}>Sign out</button>}
          </Menu>
        </div>
      </header>
      {/* Messages float over the page instead of being inserted into it, so
          saving never pushes the content down and back up. */}
      <div className={"toast" + (msg ? " show" : "")} role="status" aria-live="polite">{msg}</div>
      <main className="ht-main">
        <div className={"ht-status" + (openWindow ? "" : " clear")}>
          {openWindow ? <Flask /> : <span className="dot" />}
          {openWindow ? <span>Testing <b>{openWindow.name}</b> — day {dayN}. Hold everything else steady until you call it.</span>
                      : <span>No open test. You're at baseline — a clean starting point for one change.</span>}
        </div>
        {view === "day" && <Day data={data} save={save} date={date} setDate={setDate} />}
        {view === "week" && <Week data={data} date={date} setDate={setDate} goDay={goDay} />}
        {view === "month" && <Month data={data} save={save} date={date} setDate={setDate} goDay={goDay} />}
        {view === "library" && <Library data={data} save={save} openWindow={openWindow} />}
        {view === "trends" && <Trends data={data} dark={dark} />}
        {view === "reports" && <Reports data={data} email={LOCAL_ONLY ? "" : session.user.email} onBack={() => setView("day")} />}
      </main>
      <PlanImport data={data} save={save} open={planImport} onClose={() => setPlanImport(false)} onMessage={setMsg} />
      {dataModal && (
        <Modal title="Your data" onClose={() => setDataModal(false)}>
          <div className="csv-grid">
            <div>
              <h3><Download size={14} /> Export</h3>
              <p className="hint">Download everything, every day, food, supplement, and plan, as one JSON file. Keep it anywhere you like; it's yours, and it's the whole record. Do this whenever you want a copy outside the app.</p>
              <button className="btn" onClick={() => { exportJSON(); setDataModal(false); }}>Download backup</button>
            </div>
            <div>
              <h3><Upload size={14} /> Import</h3>
              <p className="hint">Bring in a Pathways backup: from another device, another account, or an older export. Days are matched by date and the newer version of each wins, so nothing you've logged since is lost.</p>
              <button className="btn" onClick={() => { setDataModal(false); pickImport(); }}>Choose backup file</button>
            </div>
          </div>
        </Modal>
      )}
      {contact && (
        <Modal title="Phone & texts" onClose={() => setContact(null)}>
          <label className="ht-field">Phone <span className="hint" style={{ marginTop: -4 }}>Optional. Used only to reach you about your account unless you tick the box below.</span>
            <input type="tel" autoComplete="tel" inputMode="tel" value={contact.phone} onChange={(e) => setContact({ ...contact, phone: e.target.value, err: "" })} placeholder="(555) 123-4567" />
          </label>
          <label className={"consent" + (contact.phone.trim() ? "" : " disabled")}>
            <input type="checkbox" checked={contact.texts && !!contact.phone.trim()} disabled={!contact.phone.trim()} onChange={(e) => setContact({ ...contact, texts: e.target.checked })} />
            <span>{MARKETING_CONSENT}</span>
          </label>
          {contact.err && <p className="warn">{contact.err}</p>}
          <div className="day-actions">
            <button className="btn" onClick={saveContact}>Save</button>
            {profile.phone && <button className="ht-link" onClick={() => setContact({ ...contact, phone: "", texts: false })}>Remove number</button>}
          </div>
        </Modal>
      )}
      {showPlan && (
        <Modal title="Your plan" onClose={() => setShowPlan(false)}>
          <p style={{ margin: "0 0 6px" }}><b>{PLAN_LABEL[plan] || plan}</b> · {session.user.email}</p>
          <p className="hint" style={{ margin: 0 }}>Pathways is free while it's being built. When billing turns on, it will be $0.99 per person per month. Nothing changes for you until you're asked.</p>
        </Modal>
      )}
    </div>
  );
}
