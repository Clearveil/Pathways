import { useMemo, useState } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer, CartesianGrid } from "recharts";
import { today, logged } from "../lib/utils.js";
import { buildInsights } from "../lib/insights.js";

// Four daily ratings on one chart. Each has its own line style so they stay
// distinguishable in monochrome; the chips above toggle them so the chart
// can be read one or two at a time.
export default function Trends({ data, dark }) {
  const c = dark ? { ink:"#ECECEC", mute:"#7C7C7C", grid:"#262626", card:"#1E1E1E", line:"#2E2E2E", acc:"#D9D9D9", bad:"#E08A7C", disc:"#555" } : { ink:"#161616", mute:"#8C8C8C", grid:"#EFEFEF", card:"#FFFFFF", line:"#E4E4E4", acc:"#1C1C1C", bad:"#9A3B2E", disc:"#BDBDBD" };
  const SERIES = [
    { key: "energy", label: "Energy", stroke: c.ink, width: 2, dash: undefined, opacity: 1 },
    { key: "inflammation", label: "Inflammation", stroke: c.mute, width: 1.5, dash: "4 3", opacity: 1 },
    { key: "clarity", label: "Mental clarity", stroke: c.ink, width: 1.5, dash: "1 3", opacity: 0.55 },
    { key: "stress", label: "Stress", stroke: c.mute, width: 1.5, dash: "8 3 1 3", opacity: 1 },
  ];
  const rows = data.entries.filter(logged).map((e) => ({ date: e.date, energy: e.energy, inflammation: e.inflammation ?? null, clarity: e.clarity ?? null, stress: e.stress ?? null, flare: e.flare ? e.severity : null }));
  const present = SERIES.filter((s) => rows.some((r) => r[s.key] != null));
  const [hidden, setHidden] = useState({});
  const shown = present.filter((s) => !hidden[s.key]);
  const windows = data.interventions.filter((i) => i.start && i.status !== "baseline").map((i) => ({ ...i, end: i.end || today() }));
  const fill = { testing: c.acc, established: c.acc, discontinued: c.disc };
  const insights = useMemo(() => buildInsights(data), [data]);

  return (
    <>
      <div className="ht-nav"><h2>Trends & insights</h2></div>
      {rows.length < 2 ? <div className="card"><p className="empty">Two or more logged days and the chart shows up here. Give it two weeks before reading anything into it.</p></div> : (
        <div className="card">
          <div className="series">
            {present.map((s) => (
              <button key={s.key} type="button" className={hidden[s.key] ? "" : "on"} onClick={() => setHidden((h) => ({ ...h, [s.key]: !h[s.key] }))} aria-pressed={!hidden[s.key]}>
                <svg width="22" height="6" aria-hidden="true"><line x1="1" y1="3" x2="21" y2="3" stroke={s.stroke} strokeOpacity={hidden[s.key] ? 0.35 : s.opacity} strokeWidth={s.width + 0.5} strokeDasharray={s.dash} strokeLinecap="round" /></svg>
                {s.label}
              </button>
            ))}
          </div>
          <p className="hint" style={{ marginTop: 0 }}>Tap a measure to show or hide it. Red dots are flare days, bigger is worse. Shaded bands are tests.</p>
          <div style={{ height: 300, fontSize: 12 }}>
            <ResponsiveContainer>
              <LineChart data={rows} margin={{ top: 10, right: 12, left: -18, bottom: 0 }}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke={c.mute} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 10]} stroke={c.mute} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${c.line}`, background: c.card, color: c.ink, fontSize: 12 }} />
                {windows.map((w) => <ReferenceArea key={w.id} x1={w.start} x2={w.end} fill={fill[w.status]} fillOpacity={dark ? 0.22 : 0.12} label={{ value: w.name, position: "insideTopLeft", fontSize: 11, fill: c.mute }} />)}
                {shown.map((s) => s.key === "energy" ? (
                  <Line key={s.key} type="monotone" dataKey="energy" name="energy" stroke={s.stroke} strokeWidth={s.width} isAnimationActive={false}
                    dot={(p) => p.payload.flare ? <circle key={p.payload.date} cx={p.cx} cy={p.cy} r={3 + p.payload.flare} fill={c.bad} /> : <circle key={p.payload.date} cx={p.cx} cy={p.cy} r={2.5} fill={c.ink} />} />
                ) : (
                  <Line key={s.key} type="monotone" dataKey={s.key} name={s.label.toLowerCase()} stroke={s.stroke} strokeOpacity={s.opacity} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinecap="round" dot={false} connectNulls isAnimationActive={false} />
                ))}
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
