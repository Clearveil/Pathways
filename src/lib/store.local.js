// Browser-only storage. Used when the app runs in "localonly" mode
// (npm run dev:local) so the UI can be worked on without a Supabase account.
// Same three functions and signatures as the Supabase store.
import { KEY, migrate } from "./utils.js";

export const localStore = {
  async load() {
    const raw = localStorage.getItem(KEY);
    return raw ? migrate(JSON.parse(raw)) : null;
  },
  async saveAll(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
    return true;
  },
  async profile() { return { plan: "free" }; },
  async pref(k, v) {
    if (v === undefined) return localStorage.getItem(`${KEY}:${k}`);
    localStorage.setItem(`${KEY}:${k}`, v);
    return v;
  },
};
