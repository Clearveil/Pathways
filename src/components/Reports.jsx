import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, CartesianGrid } from "recharts";
import { today, addDays, uid } from "../lib/utils.js";
import { buildReport, reportCSV, fmtDay, REPORT_MEASURES } from "../lib/report.js";
import { store } from "../lib/store.js";

// Reports: pick a date range, create a report, print it or save it as a PDF,
// or download the spreadsheet. Every report created is kept under "Your
// reports" with its full content, so a lost copy can always be reopened.

const RANGES = [["1M", 30], ["3M", 91], ["6M", 182], ["1Y", 365], ["All", "all"], ["Custom", "custom"]];

export default function Reports({ data, email, onBack }) {
  const first = data.entries.map((e) => e.date).sort()[0] || today();
  const [range, setRange] = useState("3M");
  const [custom, setCustom] = useState({ from: addDays(today(), -29), to: today() });
  const [title, setTitle] = useState("");
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);     // report being viewed
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { store.listReports().then(setList).catch((e) => { setList([]); setErr(e.message); }); }, []);

  const days = RANGES.find(([k]) => k === range)?.[1];
  const to = range === "Custom" ? custom.to : today();
  const from = range === "Custom" ? custom.from : days === "all" ? first : addDays(to, -(days - 1));
  const loggedInRange = data.entries.filter((e) => e.energy != null && e.date >= from && e.date <= to).length;

  const create = async () => {
    setErr(""); setBusy(true);
    try {
      const content = buildReport(data, { from, to, title: title.trim(), email });
      const r = { id: uid(), from, to, title: title.trim(), content, createdAt: new Date().toISOString() };
      await store.saveReport(r);
      setList((l) => [r, ...(l || [])]);
      setOpen(r);
      setTitle("");
    } catch (e) { setErr(e.message || "Couldn't create the report."); }
    setBusy(false);
  };

  if (open) return <ReportView r={open} onBack={() => setOpen(null)} />;

  return (
    <>
      <div className="ht-nav">
        <button onClick={onBack} aria-label="Back">‹</button>
        <h2>Reports</h2>
      </div>
      <div className="card">
        <h3>New report</h3>
        <p className="hint" style={{ marginTop: 0 }}>A clear summary to bring to a doctor or practitioner, or keep for your records: how you've been, what changed, what you tested, and what the data shows.</p>
        <div className="range-row" role="group" aria-label="Report period">
          {RANGES.map(([k]) => <button key={k} type="button" className={range === k ? "on" : ""} onClick={() => setRange(k)} aria-pressed={range === k}>{k}</button>)}
        </div>
        {range === "Custom" && <div className="range-custom">
          <label>From <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /></label>
          <label>To <input type="date" value={custom.to} min={custom.from} max={today()} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></label>
        </div>}
        <p className="hint">{fmtDay(from)} – {fmtDay(to)} · {loggedInRange} logged day{loggedInRange === 1 ? "" : "s"}</p>
        <label className="ht-field">Title <span className="hint" style={{ marginTop: -4 }}>Optional — e.g. "For Dr. Lee, March visit"</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Health report" maxLength={80} />
        </label>
        {err && <p className="warn">{err}</p>}
        <button className="btn" onClick={create} disabled={busy || loggedInRange === 0}>{busy ? "Creating…" : loggedInRange === 0 ? "No logged days in this period" : "Create report"}</button>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <h3>Your reports</h3>
        {list == null ? <p className="hint">Loading…</p> : list.length === 0 ? <p className="empty">Reports you create are kept here, so you can reopen or reprint one any time.</p> : (
          <ul className="list report-list">
            {list.map((r) => (
              <li key={r.id} onClick={() => setOpen(r)} role="button">
                <span style={{ flex: 1 }}>{r.title || "Health report"}<span className="muted"> · {fmtDay(r.from, { month: "short", day: "numeric" })} – {fmtDay(r.to)}</span></span>
                <span className="muted" style={{ fontSize: 12 }}>made {fmtDay(r.createdAt.slice(0, 10), { month: "short", day: "numeric" })}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// The report itself. Built to be read quickly: the answer first (summary and
// averages), then what changed and what was tested, then the detail.
// ---------------------------------------------------------------------------
function ReportView({ r, onBack }) {
  const c = r.content;
  const weekly = c.daily.length > 120;
  const rows = weekly ? weeklyRows(c.daily) : c.daily;
  const downloadCSV = () => {
    const blob = new Blob([reportCSV(c)], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `pathways-report-${c.from}-to-${c.to}.csv`; a.click();
  };
  const macro = c.findings.filter((f) => f.group === "macro"), micro = c.findings.filter((f) => f.group === "micro"), none = c.findings.filter((f) => f.group === "none");
  const LINES = { energy: { w: 2.25 }, inflammation: { w: 1.75, d: "5 3" }, clarity: { w: 1.75, d: "1 3" }, stress: { w: 1.75, d: "9 3 2 3" } };

  return (
    <>
      <div className="ht-nav no-print">
        <button onClick={onBack} aria-label="Back">‹</button>
        <h2>Report</h2>
        <span className="ht-spacer" />
        <div className="ht-tools">
          <button className="btn sm" onClick={() => window.print()}>Print / Save as PDF</button>
          <button className="btn ghost sm" onClick={downloadCSV}>Spreadsheet</button>
        </div>
      </div>
      <p className="hint no-print" style={{ marginTop: -6 }}>To save a PDF, choose Print, then "Save as PDF" (on iPhone: Print, then pinch the preview outward and share it).</p>

      <article className="report">
        <header className="r-head">
          <div>
            <div className="r-brand"><img src="/logo.png" alt="" /> Pathways</div>
            <h1>{c.title || "Health report"}</h1>
            <p>{fmtDay(c.from)} – {fmtDay(c.to)} · {c.daysLogged} of {c.daysInRange} days logged</p>
          </div>
          <p className="r-meta">Created {fmtDay(c.generatedAt.slice(0, 10))}{c.email ? <><br />{c.email}</> : null}</p>
        </header>

        <section className="r-section">
          <h2>At a glance</h2>
          <p className="r-summary">{c.summary}</p>
          <div className="r-tiles">
            {c.measures.map((m) => {
              const d = m.prev != null ? Math.round((m.avg - m.prev) * 10) / 10 : null;
              const better = d != null && d !== 0 ? (m.higherBetter ? d > 0 : d < 0) : null;
              return (
                <div key={m.key} className="r-tile">
                  <span className="r-tile-label">{m.label}</span>
                  <span className="r-tile-avg">{m.avg}</span>
                  <span className="r-tile-sub">{d == null ? "no earlier data" : d === 0 ? "same as before" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d)} vs before · ${better ? "better" : "worse"}`}</span>
                  <span className="r-tile-sub">range {m.min}–{m.max}</span>
                </div>
              );
            })}
          </div>
          <p className="r-note">Ratings are 1–10. Higher is better for energy and mental clarity; lower is better for inflammation and stress. "Before" is the same length of time just before this period.</p>
        </section>

        {rows.length > 1 && <section className="r-section">
          <h2>Over time{weekly ? " (weekly averages)" : ""}</h2>
          <div className="r-chart">
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke="#E6E6E6" vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => fmtDay(d, { month: "short", day: "numeric" })} stroke="#888" tickLine={false} axisLine={false} minTickGap={28} fontSize={10} />
                <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} stroke="#888" tickLine={false} axisLine={false} width={22} fontSize={10} />
                {c.measures.map((m) => <Line key={m.key} type="monotone" dataKey={m.key} stroke={m.key === "energy" || m.key === "clarity" ? "#161616" : "#777"} strokeOpacity={m.key === "clarity" ? 0.6 : 1} strokeWidth={LINES[m.key].w} strokeDasharray={LINES[m.key].d} dot={false} connectNulls={weekly} isAnimationActive={false} />)}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="r-legend">
            {c.measures.map((m) => <span key={m.key}><svg width="20" height="6" aria-hidden="true"><line x1="1" y1="3" x2="19" y2="3" stroke={m.key === "energy" || m.key === "clarity" ? "#161616" : "#777"} strokeOpacity={m.key === "clarity" ? 0.6 : 1} strokeWidth={LINES[m.key].w} strokeDasharray={LINES[m.key].d} /></svg>{m.label}</span>)}
          </div>
        </section>}

        <section className="r-section">
          <h2>What changed</h2>
          {c.timeline.length ? <ul className="r-timeline">{c.timeline.map((t, k) => <li key={k}><span>{fmtDay(t.date, { month: "short", day: "numeric" })}</span>{t.text}</li>)}</ul> : <p className="r-note">No changes to the routine in this period.</p>}
        </section>

        {c.tests.length > 0 && <section className="r-section">
          <h2>Tests</h2>
          {c.tests.map((t, k) => (
            <div key={k} className="r-test">
              <b>{t.name}</b> <span className="r-muted">{t.kind} · {fmtDay(t.from, { month: "short", day: "numeric" })} – {fmtDay(t.to, { month: "short", day: "numeric" })} · {t.status}</span>
              <p>{t.result || "Not enough logged days yet to compare against the weeks before it."}</p>
            </div>
          ))}
        </section>}

        <section className="r-section">
          <h2>What the data shows</h2>
          <p className="r-note">Comparisons of days with and without something, or before and after a change. They show patterns in self-reported data, not causes or diagnoses.</p>
          {macro.length > 0 && <><h3>Clear patterns</h3>{macro.map((f, k) => <div key={k} className="r-finding"><b>{f.title}</b><p>{f.body}</p></div>)}</>}
          {micro.length > 0 && <><h3>Smaller patterns to watch</h3>{micro.map((f, k) => <div key={k} className="r-finding"><b>{f.title}</b><p>{f.body}</p></div>)}</>}
          {none.length > 0 && <><h3>Checked, no clear difference</h3><p className="r-list">{none.map((f) => f.title).join(" · ")}</p></>}
          {!macro.length && !micro.length && !none.length && <p className="r-note">Not enough logged days yet for comparisons.</p>}
        </section>

        {c.routine.length > 0 && <section className="r-section">
          <h2>Routine during this period</h2>
          <table className="r-table">
            <thead><tr><th>Item</th><th>Amount</th><th>When</th><th>Since</th><th>Followed</th></tr></thead>
            <tbody>{c.routine.flatMap((g) => [
              <tr key={g.kind} className="r-group"><td colSpan={5}>{g.label}</td></tr>,
              ...g.items.map((i, k) => <tr key={g.kind + k}><td>{i.name}{i.status === "testing" ? " (testing)" : ""}{i.ended ? <span className="r-muted"> · ended {fmtDay(i.ended, { month: "short", day: "numeric" })}</span> : null}</td><td>{i.amount || "—"}</td><td>{i.schedule}</td><td>{fmtDay(i.since, { month: "short", day: "numeric", year: "2-digit" })}</td><td>{i.adherence || "—"}</td></tr>),
            ])}</tbody>
          </table>
        </section>}

        {(c.foods.tolerated.length + c.foods.not.length + c.foods.testing.length + c.drinks.tolerated.length + c.drinks.not.length + c.drinks.testing.length) > 0 && <section className="r-section">
          <h2>Foods and drinks</h2>
          <table className="r-table">
            <tbody>
              {[["Foods", c.foods], ["Drinks", c.drinks]].map(([label, t]) => [
                t.not.length > 0 && <tr key={label + "n"}><td>{label} not tolerated</td><td>{t.not.join(", ")}</td></tr>,
                t.testing.length > 0 && <tr key={label + "t"}><td>{label} being tested</td><td>{t.testing.join(", ")}</td></tr>,
                t.tolerated.length > 0 && <tr key={label + "o"}><td>{label} tolerated</td><td>{t.tolerated.join(", ")}</td></tr>,
              ])}
            </tbody>
          </table>
        </section>}

        {c.flares.length > 0 && <section className="r-section">
          <h2>Flare days</h2>
          <table className="r-table">
            <thead><tr><th>Date</th><th>Severity</th><th>Notes</th></tr></thead>
            <tbody>{c.flares.map((f) => <tr key={f.date}><td>{fmtDay(f.date, { month: "short", day: "numeric" })}</td><td>{f.severity ? `${f.severity} / 5` : "—"}</td><td>{f.notes || <span className="r-muted">no note</span>}</td></tr>)}</tbody>
          </table>
        </section>}

        <section className="r-section r-appendix">
          <h2>Daily log</h2>
          <table className="r-table r-daily">
            <thead><tr><th>Date</th>{REPORT_MEASURES.filter((m) => c.measures.some((x) => x.key === m.key)).map((m) => <th key={m.key}>{m.label === "Mental clarity" ? "Clarity" : m.label === "Inflammation" ? "Inflam." : m.label}</th>)}<th>Flare</th><th>Notes</th></tr></thead>
            <tbody>{c.daily.filter((d) => d.energy != null).map((d) => <tr key={d.date}>
              <td>{fmtDay(d.date, { month: "short", day: "numeric" })}</td>
              {REPORT_MEASURES.filter((m) => c.measures.some((x) => x.key === m.key)).map((m) => <td key={m.key}>{d[m.key] ?? "—"}</td>)}
              <td>{d.flare ? `${d.flare}/5` : ""}</td><td>{d.notes}</td>
            </tr>)}</tbody>
          </table>
        </section>

        <footer className="r-foot">Self-reported in Pathways. Patterns over small numbers of days are observations, not diagnoses. Full daily detail is in the spreadsheet download.</footer>
      </article>
    </>
  );
}

function weeklyRows(daily) {
  const weeks = {};
  daily.forEach((d) => { const dt = new Date(d.date + "T12:00:00"); const mon = addDays(d.date, -((dt.getDay() + 6) % 7)); (weeks[mon] ||= []).push(d); });
  const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
  return Object.keys(weeks).sort().map((w) => ({ date: w, ...Object.fromEntries(REPORT_MEASURES.map((m) => [m.key, mean(weeks[w].map((d) => d[m.key]))])) }));
}
