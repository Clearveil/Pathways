import { useEffect } from "react";
import { X } from "./Icons.jsx";

// Centered dialog over a dimmed page. Closes on the X, Escape, or a click
// on the backdrop. Keep contents short; this is for guidance, not forms.
export default function Modal({ title, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="modal-bg" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <button type="button" className="icon-btn close" onClick={onClose} aria-label="Close"><X /></button>
        {title && <h2>{title}</h2>}
        {children}
      </div>
    </div>
  );
}
