import { useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ReferenceArea, ResponsiveContainer, CartesianGrid } from "recharts";
import { today, logged } from "../lib/utils.js";
import { buildInsights } from "../lib/insights.js";

export default function Trends({ data, dark }) {
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
