# Pathways — handoff brief

Give this file, `health-tracker.jsx`, and `supabase-schema.sql` to Claude Code
at the start of the project. Ask it to read all three before writing anything.

## What this is

A personal health tracker for someone with an undiagnosed chronic illness.
The point is not to log a lot of things. The point is to isolate one variable
at a time so the data can actually answer a question. Every design decision
below follows from that.

## The rule that matters most

**One open test window at a time.** If a supplement is being tested, no food
test may start, and vice versa. The UI blocks it and the database enforces it
with a partial unique index. If a future feature makes this rule inconvenient,
the feature is wrong, not the rule. Two simultaneous changes means neither
result can be trusted, which makes the whole tracker pointless.

## Current state

`health-tracker.jsx` is a working single-file React app. It stores data in the
browser via a small `store` object near the top of the file. Everything the app
does with saved data goes through those three functions — nothing else touches
storage directly. That boundary is deliberate: swapping to Supabase should mean
rewriting `store` and almost nothing else.

Existing shape: entries (one per day), foods, interventions, meals, workouts.
Every row already carries a stable `id` and an `updatedAt` timestamp. There is
a `migrate()` function that upgrades older saved data forward on load — follow
that pattern for any future schema change.

## Build order

1. **Scaffold** a Vite + React project. Port the existing component in as-is
   and confirm it runs unchanged with browser storage. Do not refactor and
   migrate in the same step.
2. **Split the file.** It is one large file because artifacts require that.
   Break it into components: Day, Week, Month, Library, Trends, plus an
   `insights.js` holding `buildInsights`. Keep behaviour identical.
3. **Supabase.** Run `supabase-schema.sql`. Add auth (email magic link is
   simplest). Rewrite `store` to read and write Supabase instead of
   `window.storage`. Keep the same function signatures.
4. **Mobile.** Day view is close already. Month view will not survive seven
   columns on a phone — make it a scrolling list at narrow widths. Test on a
   real phone over the dev server, not in a resized desktop browser.
5. **Deploy** to Vercel. Add a web manifest so iOS "Add to Home Screen" gives
   it an icon and opens fullscreen. This is likely the finish line; a native
   app is not needed unless push notifications become necessary.

## Non-negotiables

- **Every query filters by user_id.** RLS is the safety net, not the plan.
- **Export must keep working.** JSON download of everything, on the main
  screen, not buried in settings. The user should never be locked in.
- **Insights stay honest.** They are arithmetic over small samples. They must
  say "not enough data" when that is true and "no clear difference" when that
  is the result. Never inflate a weak signal into a recommendation. A
  supplement that does nothing is a real finding.
- **Skipping is data, not failure.** Planned workouts are three-state (done,
  modified, skipped) on purpose. Never render a skipped day as a red X or a
  broken streak. No streak counters anywhere.
- **No sleep tracking.** Removed at the user's request; tracking it caused
  overthinking about falling asleep. Do not re-add it as a "helpful" default.

## Deliberately not built yet

- **Payments.** `profiles.plan` exists and defaults to `'free'` so a gate has
  somewhere to check later. Do not build Stripe until there is a reason.
- **Sharing or multi-user features.** Assume strictly one person per account.
- **Notifications and reminders.** The user explicitly does not want a system
  that demands constant attention. Ask before adding anything that pings.

## Notes on the person using it

Analytical, novice at development, learning as he goes. Explain what you are
doing and why. He would rather understand the system than be handed a black
box. He has limited energy on some days, so prefer small verifiable steps that
leave the app working over large refactors that leave it broken overnight.
