// One Supabase client for the whole app. Reads its connection details from
// .env.local (see .env.example). Fails loudly if they are missing, because
// a silent misconfiguration would look like "nothing saves".
//
// LOCAL_ONLY is a build-time switch (npm run dev:local) that runs the app with
// no account and browser storage instead. It is only ever true in that mode;
// production builds never see it.
import { createClient } from "@supabase/supabase-js";

export const LOCAL_ONLY = import.meta.env.VITE_LOCAL_ONLY === "true";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!LOCAL_ONLY && (!url || !key)) {
  throw new Error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env.local and fill it in.");
}

export const supabase = LOCAL_ONLY ? null : createClient(url, key);
