import { useState } from "react";
import { supabase } from "../lib/supabase.js";
import { KEY } from "../lib/utils.js";
import { css } from "../styles.js";

// Sign in / create account. Email + password through Supabase Auth.
// Nothing here touches app data; once a session exists, App renders the tracker.
export default function Auth() {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  let dark = false;
  try { dark = localStorage.getItem(`${KEY}:theme`) === "dark"; } catch (e) {}

  const submit = async (e) => {
    e.preventDefault();
    setErr(""); setNote(""); setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // With email confirmation switched on, Supabase creates the user but
        // withholds the session until the link in the email is clicked.
        if (!data.session) setNote("Account created. Check your email for a confirmation link, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) { setErr(e.message || "Something went wrong"); }
    setBusy(false);
  };

  const flip = () => { setMode(mode === "signup" ? "signin" : "signup"); setErr(""); setNote(""); };

  return (
    <div className={"ht auth" + (dark ? " dark" : "")}>
      <style>{css}</style>
      <form className="card" onSubmit={submit}>
        <img className="logo" src="/logo.png" alt="" />
        <h1>Pathways</h1>
        <p className="hint sub">{mode === "signup" ? "Create an account. Your data is yours alone." : "Sign in to your health log."}</p>
        <label className="ht-field">Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="ht-field">Password
          <input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8}
            value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err && <div className="warn">{err}</div>}
        {note && <div className="ht-status clear"><span className="dot" /><span>{note}</span></div>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "One moment…" : mode === "signup" ? "Create account" : "Sign in"}</button>
        <div className="switch-mode">
          <button type="button" className="ht-link" onClick={flip}>
            {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
        </div>
      </form>
    </div>
  );
}
