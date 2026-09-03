import { KEY, migrate } from "./utils.js";

// ---------------------------------------------------------------------------
// Storage boundary. Everything the app does with saved data goes through this.
// Swapping to Supabase means rewriting these three functions and nothing else.
// ---------------------------------------------------------------------------
// Step 1 (Vite port): the artifact's `window.storage` API doesn't exist in a
// real browser, so these three functions now talk to localStorage instead.
// Same signatures, same async shape — the rest of the app is untouched.
// Step 3 will rewrite these same three functions against Supabase.
export const store = {
  async load() {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  },
  async saveAll(data) {
    localStorage.setItem(KEY, JSON.stringify(data)); // throws if storage is full or blocked
    return true;
  },
  async pref(k, v) {
    if (v === undefined) return localStorage.getItem(`${KEY}:${k}`);
    localStorage.setItem(`${KEY}:${k}`, v);
    return v;
  },
};
