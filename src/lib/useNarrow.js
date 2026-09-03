import { useEffect, useState } from "react";

// True when the viewport is at or below `px` wide. Tracks rotation and
// window resizes. Used where a view needs a different structure on a phone,
// not just different CSS (e.g. Month: grid on desktop, list on mobile).
export function useNarrow(px = 720) {
  const q = `(max-width:${px}px)`;
  const [narrow, setNarrow] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const onChange = (e) => setNarrow(e.matches);
    m.addEventListener("change", onChange);
    return () => m.removeEventListener("change", onChange);
  }, [q]);
  return narrow;
}
