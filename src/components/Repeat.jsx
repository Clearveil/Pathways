import { useEffect, useRef, useState } from "react";

// "Repeat" button for a Day card: a small chip that opens a list of recent
// or saved items for that section. One tap adds the item. The button itself
// never shows item names, so the card stays calm.
//   items: [{ key, label, detail, onPick }]
export default function Repeat({ items, label = "Repeat", empty = "Nothing to repeat yet — things you log here will show up next time." }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className="menu-wrap" ref={ref}>
      <button type="button" className="btn ghost sm repeat-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
        {label}
      </button>
      {open && (
        <div className="menu repeat-menu">
          {!items.length && <p className="hint" style={{ padding: "8px 10px", margin: 0 }}>{empty}</p>}
          {items.map((it) => (
            <button key={it.key} type="button" onClick={() => { it.onPick(); setOpen(false); }}>
              {it.label}{it.detail ? <small>{it.detail}</small> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
