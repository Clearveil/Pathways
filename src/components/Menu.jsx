import { useEffect, useRef, useState } from "react";

// A button that opens a small dropdown. Closes on outside click, Escape,
// or when any item inside is clicked. `text` shows a label next to the
// icon; CSS hides that label on phones so the button collapses to the icon.
export default function Menu({ icon, text, label, className = "", children }) {
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
    <div className={"menu-wrap " + className} ref={ref}>
      <button type="button" className={text ? "ht-link with-icon" : "icon-btn"} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label={label} title={label}>
        {icon}{text && <span className="menu-text">{text}</span>}
      </button>
      {open && <div className="menu" onClick={() => setOpen(false)}>{children}</div>}
    </div>
  );
}
