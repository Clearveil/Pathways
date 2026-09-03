// One Supabase client for the whole app. Reads its connection details from
// .env.local (see .env.example). If they are missing, CONFIG_ERROR carries a
// message and App shows it on screen, because a silent misconfiguration
// would look like "nothing saves" or a blank page.
//
// LOCAL_ONLY is a build-time switch (npm run dev:local) that runs the app with
// no account and browser storage instead. It is only ever true in that mode;
// production builds never see it.
import { createClient } from "@supabase/supabase-js";

export const LOCAL_ONLY = import.meta.env.VITE_LOCAL_ONLY === "true";

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const CONFIG_ERROR = !LOCAL_ONLY && (!url || !key)
  ? "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are not set. Locally: copy .env.example to .env.local and fill it in. On Vercel: add both under Settings, Environment Variables, then redeploy."
  : null;

export const supabase = LOCAL_ONLY || CONFIG_ERROR ? null : createClient(url, key);
