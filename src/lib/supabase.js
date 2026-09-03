// One Supabase client for the whole app. Reads its connection details from
// .env.local (see .env.example). Fails loudly if they are missing, because
// a silent misconfiguration would look like "nothing saves".
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill it in.");
}

export const supabase = createClient(url, key);
