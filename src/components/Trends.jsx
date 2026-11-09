import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer, CartesianGrid } from "recharts";
import { today, addDays, logged } from "../lib/utils.js";
import { buildInsights, GROUPS } from "../lib/insights.js";

// Trends: one small chart per measure, stacked on a shared time axis, so
// each line can be read on its own instead of four overlapping in grey.
// The range row above scopes every chart and every average below it.
// Insights further down always use all history — a 3-day window is too
// small to compare anything honestly.

const RANGES = [["3D", 3], ["1W", 7], ["1M", 30], ["3M", 91], ["1Y", 365], ["2Y", 730], ["All", "all"], ["Custom", "custom"]];
const MEASURES = [
  { key: "energy", label: "Energy", higherBetter: true },
  { key: "inflammation", label: "Inflammation", higherBetter: false },
  { key: "clarity", label: "Mental clarity", higherBetter: true },
  { key: "stress", label: "Stress", higherBetter: false },
];
const dayDiff = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
const mondayOf = (ds) => { const d = new Date(ds + "T12:00:00"); return addDays(ds, -((d.getDay() + 6) % 7)); };
const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };

export default function Trends({ data, dark }) {
  const c = dark ? { ink: "#ECECEC", mute: "#7C7C7C", grid: "#262626", card: "#1E1E1E", line: "#2E2E2E", band: "#D9D9D9", bad: "#E08A7C" } : { ink: "#161616", mute: "#8C8C8C", grid: "#EFEFEF", card: "#FFFFFF", line: "#E4E4E4", band: "#1C1C1C", bad: "#9A3B2E" };
  const entries = data.entries.filter(logged);
  const first = entries[0]?.date || today();
  const [range, setRange] = useState("1M");
  const [custom, setCustom] = useState({ from: addDays(today(), -29), to: today() });
  const [open, setOpen] = useState({ macro: true, micro: true });

  // ---- the window being shown, and the same-length window before it
  const days = RANGES.find(([k]) => k === range)?.[1];
  const to = range === "Custom" ? custom.to : today();
  const from = range === "Custom" ? custom.from : days === "all" ? first : addDays(to, -(days - 1));
  const len = dayDiff(from, to) + 1;
  const prevTo = addDays(from, -1), prevFrom = addDays(from, -len);
  const inWin = entries.filter((e) => e.date >= from && e.date <= to);
  const inPrev = entries.filter((e) => e.date >= prevFrom && e.date <= prevTo);
  const weekly = len > 120;   // long ranges plot weekly averages so the line stays readable

  // ---- rows: every day in range (gaps stay gaps), or weekly averages
  const rows = useMemo(() => {
    const byDate = Object.fromEntries(inWin.map((e) => [e.date, e]));
    if (!weekly) {
      const out = [];
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const e = byDate[d];
        out.push({ date: d, energy: e?.energy ?? null, inflammation: e?.inflammation ?? null, clarity: e?.clarity ?? null, stress: e?.stress ?? null, flare: e?.flare ? e.severity : null });
      }
      return out;
    }
    const weeks = {};
    inWin.forEach((e) => { (weeks[mondayOf(e.date)] ||= []).push(e); });
    return Object.keys(weeks).sort().map((w) => ({ date: w, ...Object.fromEntries(MEASURES.map((m) => [m.key, mean(weeks[w].map((e) => e[m.key]))])), flareDays: weeks[w].filter((e) => e.flare).length }));
  }, [data, from, to, weekly]);

  const present = MEASURES.filter((m) => entries.some((e) => e[m.key] != null));
  const windows = data.interventions.filter((i) => i.start && i.status !== "baseline").map((i) => ({ ...i, end: i.end || today() }))
    .filter((w) => w.start <= to && w.end >= from).map((w) => ({ ...w, x1: weekly ? mondayOf(w.start < from ? from : w.start) : (w.start < from ? from : w.start), x2: weekly ? mondayOf(w.end > to ? to : w.end) : (w.end > to ? to : w.end) }));
  const tickFmt = (d) => {
    const dt = new Date(d + "T12:00:00");
    if (len <= 7) return dt.toLocaleDateString("en-US", { weekday: "short" });
    if (len <= 120) return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    return dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
  };
  const tipLabel = (d) => weekly ? `Week of ${new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  const priorLabel = range === "All" ? null : range === "Custom" ? `previous ${len} days` : `previous ${{ "3D": "3 days", "1W": "week", "1M": "30 days", "3M": "3 months", "1Y": "year", "2Y": "2 years" }[range]}`;

  const insights = useMemo(() => buildInsights(data), [data]);
  const grouped = GROUPS.map((g) => ({ ...g, items: insights.filter((x) => x.group === g.key) })).filter((g) => g.items.length);

  return (
    <>
      <div className="ht-nav"><h2>Trends & insights</h2></div>

      <div className="range-row" role="group" aria-label="Date range">
        {RANGES.map(([k]) => <button key={k} type="button" className={range === k ? "on" : ""} onClick={() => setRange(k)} aria-pressed={range === k}>{k}</button>)}
      </div>
      {range === "Custom" && <div className="range-custom">
        <label>From <input type="date" value={custom.from} max={custom.to} onChange={(e) => e.target.value && setCustom({ ...custom, from: e.target.value })} /></label>
        <label>To <input type="date" value={custom.to} min={custom.from} max={today()} onChange={(e) => e.target.value && setCustom({ ...custom, to: e.target.value })} /></label>
      </div>}

      {inWin.length === 0 ? <div className="card"><p className="empty">No days logged in this range.{entries.length ? " Try a longer one." : " Two or more logged days and the charts show up here."}</p></div> : (
        <div className="card trends-card">
          <p className="hint" style={{ marginTop: 0 }}>
            {inWin.length} logged day{inWin.length === 1 ? "" : "s"} in this range{weekly ? " · lines show weekly averages" : " · blank stretches are days with nothing logged"}. Shaded bands are tests{present[0]?.key === "energy" ? "; red dots on Energy are flare days" : ""}.
          </p>
          {present.map((m, idx) => {
            const a = mean(inWin.map((e) => e[m.key])), p = mean(inPrev.map((e) => e[m.key]));
            const d = a != null && p != null ? a - p : null;
            const better = d != null && Math.abs(d) >= 0.05 ? (m.higherBetter ? d > 0 : d < 0) : null;
            const last = idx === present.length - 1;
            return (
              <div key={m.key} className="spark">
                <div className="spark-head">
                  <span className="spark-label">{m.label}</span>
                  <span className="spark-avg">{a != null ? a.toFixed(1) : "—"}<small> avg</small></span>
                  {priorLabel && <span className="spark-delta">{d == null ? `no data for the ${priorLabel}` : Math.abs(d) < 0.05 ? `same as the ${priorLabel}` : `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(1)} vs ${priorLabel} · ${better ? "better" : "worse"}`}</span>}
                </div>
                <div style={{ height: last ? 118 : 96, fontSize: 11 }}>
                  <ResponsiveContainer>
                    <LineChart data={rows} syncId="trends" margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke={c.grid} vertical={false} />
                      <XAxis dataKey="date" hide={!last} tickFormatter={tickFmt} stroke={c.mute} tickLine={false} axisLine={false} minTickGap={24} />
                      <YAxis domain={[0, 10]} ticks={[0, 5, 10]} stroke={c.mute} tickLine={false} axisLine={false} width={22} />
                      <Tooltip labelFormatter={tipLabel} formatter={(v) => [v == null ? "—" : Number(v).toFixed(weekly ? 1 : 0), m.label]}
                        contentStyle={{ borderRadius: 10, border: `1px solid ${c.line}`, background: c.card, color: c.ink, fontSize: 12 }} cursor={{ stroke: c.mute, strokeDasharray: "3 3" }} />
                      {windows.map((w) => <ReferenceArea key={w.id} x1={w.x1} x2={w.x2} fill={c.band} fillOpacity={dark ? 0.16 : 0.07} label={idx === 0 ? { value: w.name, position: "insideTopLeft", fontSize: 10, fill: c.mute } : undefined} />)}
                      <Line type="monotone" dataKey={m.key} stroke={c.ink} strokeWidth={2} isAnimationActive={false} connectNulls={weekly}
                        dot={m.key === "energy" ? (pp) => {
                          const fl = weekly ? pp.payload.flareDays : pp.payload.flare;
                          if (pp.value == null) return <g key={pp.payload.date} />;
                          if (fl) return <circle key={pp.payload.date} cx={pp.cx} cy={pp.cy} r={weekly ? 3 + Math.min(fl, 4) : 3 + fl} fill={c.bad} stroke={c.card} strokeWidth={1.5} />;
                          return len <= 31 ? <circle key={pp.payload.date} cx={pp.cx} cy={pp.cy} r={2.5} fill={c.ink} /> : <g key={pp.payload.date} />;
                        } : len <= 31 ? { r: 2.5, fill: c.ink, strokeWidth: 0 } : false}
                        activeDot={{ r: 4, fill: c.ink, stroke: c.card, strokeWidth: 2 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="ins-head">
        <h3>Insights</h3>
        <span className="hint">From all your history, not just the range above.</span>
      </div>
      {grouped.map((g) => (
        <details key={g.key} className="ins-group" open={!!open[g.key]} onToggle={(e) => { const isOpen = e.currentTarget.open; setOpen((o) => o[g.key] === isOpen ? o : { ...o, [g.key]: isOpen }); }}>
          <summary><span className="ins-title">{g.label}</span><span className="ins-count">{g.items.length}</span></summary>
          <p className="hint ins-hint">{g.hint}</p>
          <div className="insights">
            {g.items.map((x, i) => <div key={i} className={"insight " + x.tone}><b>{x.title}</b>{x.body}</div>)}
          </div>
        </details>
      ))}
    </>
  );
}
