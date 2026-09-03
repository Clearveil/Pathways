// A monochrome picture of what a CSV should look like: a little spreadsheet
// with a dark header row and a couple of example rows. Pure SVG, sized from
// the text it holds, coloured by the surrounding text colour.
export default function CsvExample({ columns, rows, label }) {
  const ch = 7.2, padX = 12, rowH = 28;
  const widths = columns.map((c, i) => Math.max(c.length, ...rows.map((r) => (r[i] || "").length)) * ch + padX * 2);
  const W = widths.reduce((a, b) => a + b, 0);
  const H = rowH * (rows.length + 1);
  const xs = widths.reduce((acc, w) => [...acc, acc[acc.length - 1] + w], [0]);
  return (
    <svg className="csv-ex" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <defs>
        <clipPath id={`clip-${label}`}><rect x="0" y="0" width={W} height={H} rx="10" /></clipPath>
      </defs>
      <g clipPath={`url(#clip-${label})`}>
        <rect x="0" y="0" width={W} height={H} fill="var(--card)" />
        <rect x="0" y="0" width={W} height={rowH} fill="currentColor" />
        {rows.map((_, r) => <line key={r} x1="0" x2={W} y1={rowH * (r + 1)} y2={rowH * (r + 1)} stroke="currentColor" strokeOpacity=".18" />)}
        {xs.slice(1, -1).map((x) => <line key={x} x1={x} x2={x} y1="0" y2={H} stroke="currentColor" strokeOpacity=".18" />)}
        {columns.map((c, i) => <text key={c} x={xs[i] + padX} y={rowH / 2 + 4} fontSize="12" fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" fill="var(--card)">{c}</text>)}
        {rows.map((r, ri) => r.map((v, i) => (
          <text key={i} x={xs[i] + padX} y={rowH * (ri + 1) + rowH / 2 + 4} fontSize="12" fontFamily="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" fill="currentColor" fillOpacity={ri === 0 ? 1 : .7}>{v}</text>
        )))}
      </g>
      <rect x=".5" y=".5" width={W - 1} height={H - 1} rx="10" fill="none" stroke="currentColor" strokeOpacity=".35" />
    </svg>
  );
}
