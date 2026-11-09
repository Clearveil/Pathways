// Insights are arithmetic over small samples. They must say "not enough data"
// when that is true and "no clear difference" when that is the result.
// Never inflate a weak signal into a recommendation.
//
// Every card carries the numbers it was judged on, and its group is computed
// from those numbers, never from its wording:
//   effect  the biggest gap on any of the four measures, in rating points
//           (energy, inflammation, clarity, stress; positive = better)
//   n       days on the smaller side of the comparison
//   span    calendar days the comparison covers
// The verdict sentence on each card uses the same thresholds as the group,
// so a card can't say "no clear difference" and sit under Macro.

import { today, addDays, mealsOn, workoutsOn, logged, adherence, usesStatus, scheduledOn, changesOf, testWindows, testStart } from "./utils.js";

export const NOISE = 0.5;  // under this, day-to-day noise
export const CLEAR = 1.0;  // at or over this (with enough days), a clear gap

export const GROUPS = [
  { key: "macro", label: "Macro", hint: "Big or long-running: a gap of 1 point or more on a measure with at least 10 days on each side, or a steady shift across a month or more." },
  { key: "micro", label: "Micro", hint: "Smaller, earlier or mixed: a gap of half a point to a point, a bigger gap seen on only a few days, or results that point different ways. Worth watching, not acting on yet." },
  { key: "none", label: "No clear difference", hint: "Enough days on each side, and the gap is under half a point. That's a real result: this probably isn't moving anything." },
  { key: "collecting", label: "Still collecting", hint: "Not enough days yet to compare honestly." },
  { key: "notes", label: "Notes", hint: "Counts and reminders, not comparisons." },
];

export function classify(c) {
  if (c.kind === "info") return "notes";
  if (c.kind === "waiting") return "collecting";
  const e = Math.abs(c.effect || 0), n = c.n || 0;
  if (n < 3) return "collecting";
  if (!c.mixed && e >= CLEAR && n >= 10) return "macro";
  if (!c.mixed && (c.span || 0) >= 28 && e >= 0.7 && n >= 14) return "macro";
  if (e >= NOISE) return "micro";
  return n >= 5 ? "none" : "collecting";
}

export function buildInsights(data) {
  const out = [];
  const E = data.entries.filter(logged);   // a day counts only once its ratings are filled in
  const n = E.length;
  const avg = (a) => a.length ? a.reduce((s, e) => s + e.energy, 0) / a.length : null;
  const flareRate = (a) => a.length ? a.filter((e) => e.flare).length / a.length : null;
  const mean = (k) => (a) => { const b = a.filter((e) => e[k] != null); return b.length ? b.reduce((s, e) => s + e[k], 0) / b.length : null; };
  const inf = mean("inflammation"), clar = mean("clarity"), strs = mean("stress");
  // Secondary measures appended to every comparison.
  const infTxt = (a, b) =>
    ((inf(a) != null && inf(b) != null) ? ` Inflammation ${inf(a).toFixed(1)} vs ${inf(b).toFixed(1)}.` : "") +
    ((clar(a) != null && clar(b) != null) ? ` Mental clarity ${clar(a).toFixed(1)} vs ${clar(b).toFixed(1)}.` : "") +
    ((strs(a) != null && strs(b) != null) ? ` Stress ${strs(a).toFixed(1)} vs ${strs(b).toFixed(1)}.` : "");
  const byDate = Object.fromEntries(E.map((e) => [e.date, e]));
  const nextDays = (arr) => arr.map((e) => byDate[addDays(e.date, 1)]).filter(Boolean);
  const prevDays = (arr) => arr.map((e) => byDate[addDays(e.date, -1)]).filter(Boolean);
  // Biggest gap across the four measures, signed so positive = better for
  // `a`, with the measure that produced it so the card can name it.
  const MEAS = [["energy", avg, true], ["inflammation", inf, false], ["mental clarity", clar, true], ["stress", strs, false]];
  const gapInfo = (a, b) => {
    let best = { g: 0, label: "", va: null, vb: null };
    MEAS.forEach(([label, fn, higherBetter]) => {
      const va = fn(a), vb = fn(b);
      if (va == null || vb == null) return;
      const g = higherBetter ? va - vb : vb - va;
      if (Math.abs(g) > Math.abs(best.g)) best = { g, label, va, vb };
    });
    return best;
  };
  const gap = (a, b) => gapInfo(a, b).g;
  // Same day and next day can disagree. Then the result is "mixed": named
  // as such, and never promoted to Macro.
  const pickGap = (sameI, nextI) => {
    const gi = nextI && Math.abs(nextI.g) > Math.abs(sameI.g) ? nextI : sameI;
    const mixed = !!nextI && Math.abs(sameI.g) >= NOISE && Math.abs(nextI.g) >= NOISE && Math.sign(sameI.g) !== Math.sign(nextI.g);
    return { ...gi, mixed, sameI, nextI };
  };
  const toneOf = (g) => g >= NOISE ? "up" : g <= -NOISE ? "down" : "flat";
  // The verdict sentence, from the same thresholds as the grouping, naming
  // the measure that moved.
  const say = (gi, up, down, flat) => {
    const g = typeof gi === "number" ? gi : gi.g;
    if (gi && gi.mixed) return `Mixed: ${gi.sameI.label} ${gi.sameI.g > 0 ? "better" : "worse"} the same day, ${gi.nextI.label} ${gi.nextI.g > 0 ? "better" : "worse"} the next day. Too tangled to call either way yet.`;
    if (Math.abs(g) < NOISE) return flat;
    const which = typeof gi === "object" && gi.label ? `Biggest gap is ${gi.label}: ${gi.va.toFixed(1)} vs ${gi.vb.toFixed(1)}. ` : "";
    return (Math.abs(g) < CLEAR ? "A small difference, worth watching rather than acting on. " : "") + which + (g > 0 ? up : down);
  };
  const spanOf = (arr) => arr.length ? Math.round((new Date(arr[arr.length - 1].date) - new Date(arr[0].date)) / 864e5) + 1 : 0;
  const inRange = (s, e) => E.filter((x) => x.date >= s && x.date <= e);
  const card = (c) => out.push(c);

  if (n === 0) { card({ kind: "waiting", tone: "flat", title: "Nothing to read yet", body: "Insights appear once there's data. The first two weeks are baseline — the goal is to see what a normal week looks like before changing anything." }); return out; }
  if (n < 7) card({ kind: "waiting", tone: "flat", title: `${n} day${n > 1 ? "s" : ""} logged`, body: "Too early to draw anything. A week of entries gives a rough baseline; two weeks is when patterns start to be worth looking at." });

  // ---- Long-run and recent trends -------------------------------------------
  {
    const t = today();
    const last30 = inRange(addDays(t, -29), t), prev30 = inRange(addDays(t, -59), addDays(t, -30));
    if (last30.length >= 14 && prev30.length >= 14) {
      const gi = gapInfo(last30, prev30), g = gi.g;
      card({ kind: "compare", effect: g, n: Math.min(last30.length, prev30.length), span: 60, tone: toneOf(g), title: "Last 30 days vs the 30 before",
        body: `Energy ${avg(last30).toFixed(1)} vs ${avg(prev30).toFixed(1)}.${infTxt(last30, prev30)} Flare days ${Math.round(flareRate(last30) * 100)}% vs ${Math.round(flareRate(prev30) * 100)}%. ${say(gi, "The month-scale direction is better. That's the trend that matters most — single weeks bounce around.", "The month-scale direction is worse. Look at what changed around the turn — a new test, a season, a stressor.", "Holding steady across two months. A stable baseline is what makes a test readable.")}` });
    }
  }
  if (n >= 14) {
    const last = E.slice(-7), prev = E.slice(-14, -7);
    const gi = gapInfo(last, prev), g = gi.g;
    card({ kind: "compare", effect: g, n: 7, span: spanOf(E.slice(-14)), tone: toneOf(g), title: "This week vs last week",
      body: `Average energy ${avg(last).toFixed(1)} vs ${avg(prev).toFixed(1)}. Flare days: ${last.filter((e) => e.flare).length} vs ${prev.filter((e) => e.flare).length}.${infTxt(last, prev)} ${say(gi, "Better. Check the notes from this week for what might explain it.", "Lower. Look at what was different — the notes column is where the answer usually is.", "About the same — a stable baseline, which is what you want before testing something.")}` });
  }

  // ---- Mental clarity ---------------------------------------------------------
  // What comes the day before foggy days vs clear ones. These are percentages
  // of days, not rating points, so a 40-point gap in how often something
  // happens is treated as a clear gap and 25 points as a small one.
  {
    const C = E.filter((e) => e.clarity != null);
    if (C.length >= 10) {
      const foggy = C.filter((e) => e.clarity <= 4), clear = C.filter((e) => e.clarity >= 7);
      const pct = (arr, f) => arr.length ? Math.round(100 * arr.filter(f).length / arr.length) : null;
      let body = `${foggy.length} foggy day${foggy.length === 1 ? "" : "s"} (4 or below) out of ${C.length} rated.`;
      let effect = 0, nn = Math.min(foggy.length, clear.length), tone = "flat";
      if (foggy.length >= 3 && clear.length >= 3) {
        const dE = avg(foggy) - avg(clear);
        body += ` Energy on foggy days averages ${avg(foggy).toFixed(1)} vs ${avg(clear).toFixed(1)} on clear days${Math.abs(dE) < CLEAR ? " — clarity and energy are moving separately, which is worth knowing." : " — they move together."}`;
        const fb = prevDays(foggy), cb = prevDays(clear);
        nn = Math.min(fb.length, cb.length);
        if (nn >= 3) {
          const bits = [];
          let maxGap = 0;
          const check = (a, b, text) => { if (a == null || b == null) return; const d = Math.abs(a - b); if (d >= 25) { bits.push(text(a, b)); maxGap = Math.max(maxGap, d); } };
          check(pct(fb, (e) => e.activity === "hard" || e.activity === "moderate"), pct(cb, (e) => e.activity === "hard" || e.activity === "moderate"), (a, b) => `moderate or hard activity the day before ${a}% of foggy days vs ${b}% of clear ones`);
          check(pct(fb, (e) => (e.extras || []).length > 0), pct(cb, (e) => (e.extras || []).length > 0), (a, b) => `unplanned food the day before ${a}% vs ${b}%`);
          check(pct(fb.filter((e) => e.stress != null), (e) => e.stress >= 7), pct(cb.filter((e) => e.stress != null), (e) => e.stress >= 7), (a, b) => `high stress (7+) the day before ${a}% vs ${b}%`);
          effect = maxGap >= 40 ? -CLEAR : maxGap >= 25 ? -NOISE : 0;
          tone = bits.length ? "down" : "flat";
          body += bits.length ? ` The day before matters: ${bits.join("; ")}.` : " Nothing in the day before (activity, unplanned food, stress) separates foggy days from clear ones so far.";
        }
      } else if (foggy.length < 3) body += " Not enough foggy days to compare against — which is good news.";
      card({ kind: foggy.length >= 3 && clear.length >= 3 ? "compare" : "waiting", effect, n: nn, tone, title: "Mental clarity", body });
    }
  }

  // ---- Stress -----------------------------------------------------------------
  {
    const S = E.filter((e) => e.stress != null);
    if (S.length >= 10) {
      const hi = S.filter((e) => e.stress >= 7), lo = S.filter((e) => e.stress <= 3);
      let body = `${hi.length} high-stress day${hi.length === 1 ? "" : "s"} (7 or above) and ${lo.length} calm ones (3 or below) out of ${S.length} rated.`;
      if (hi.length >= 3 && lo.length >= 3) {
        const sameDay = infTxt(hi, lo).replace(/ Stress [\d.]+ vs [\d.]+\./, "");
        body += ` Same day: energy ${avg(hi).toFixed(1)} vs ${avg(lo).toFixed(1)}.${sameDay}`;
        const ha = nextDays(hi), la = nextDays(lo);
        if (ha.length >= 3 && la.length >= 3) {
          const fh = flareRate(ha), fl = flareRate(la);
          const gi = gapInfo(ha, la), g = gi.g;
          body += ` The day after: energy ${avg(ha).toFixed(1)} vs ${avg(la).toFixed(1)}, flares ${Math.round(fh * 100)}% vs ${Math.round(fl * 100)}%. `;
          body += (fh - fl > 0.2) ? "Stress is showing up as next-day flares — a lever worth knowing about, even if it isn't an easy one." : say(gi, "High-stress days don't seem to cost you the next day.", "High-stress days cost you the next day too.", "No clear next-day cost so far.");
          card({ kind: "compare", effect: fh - fl > 0.2 ? -Math.max(Math.abs(g), CLEAR) : g, n: Math.min(ha.length, la.length), tone: fh - fl > 0.2 ? "down" : toneOf(g), title: "Stress", body });
        } else card({ kind: "waiting", tone: "flat", title: "Stress", body: body + " Not enough next days logged to compare yet." });
      } else card({ kind: "waiting", tone: "flat", title: "Stress", body: body + " Not enough of both kinds of day to compare yet." });
    }
  }

  // ---- Each tested intervention -------------------------------------------------
  data.interventions.filter((i) => i.start && ["testing", "established", "discontinued"].includes(i.status)).forEach((i) => {
    const start = testStart(data, i);
    const end = i.end || today();
    const inside = inRange(start, end);
    const before = inRange(addDays(start, -14), addDays(start, -1));
    if (inside.length < 5) return card({ kind: "waiting", tone: "flat", title: i.name, body: `${inside.length} day${inside.length === 1 ? "" : "s"} of data inside this window. Five is the minimum before comparing; ten to fourteen is better.` });
    if (before.length < 5) return card({ kind: "waiting", tone: "flat", title: i.name, body: `${inside.length} days logged during, but fewer than 5 days logged before it started — no baseline to compare against. The comparison would be meaningless.` });
    const gi = gapInfo(inside, before), g = gi.g;
    const fd = flareRate(inside) - flareRate(before);
    card({ kind: "compare", effect: g, n: Math.min(inside.length, before.length), span: spanOf(inside), tone: toneOf(g), title: `${i.name} (${inside.length} days)`,
      body: `Energy averaged ${avg(inside).toFixed(1)} during vs ${avg(before).toFixed(1)} in the two weeks before.${infTxt(inside, before)} Flare days: ${Math.round(flareRate(inside) * 100)}% vs ${Math.round(flareRate(before) * 100)}%${Math.abs(fd) > 0.15 ? (fd < 0 ? " — fewer, which matters more than any single average." : " — more, which matters more than any single average.") : "."} ${say(gi, "A real-looking difference — worth keeping, but one window isn't proof.", "Worse than before. If nothing else changed, that's a signal to stop and see if it recovers.", "No clear difference. That's a valid result — this one probably isn't doing much either way.")}` });
  });

  // ---- Food and drink tests (windows come from the change log) ---------------------
  testWindows(data).forEach((w) => {
    const inside = inRange(w.from, w.to), before = inRange(addDays(w.from, -14), addDays(w.from, -1));
    const title = `${w.name} (${w.kind} test${w.result === "ongoing" ? ", ongoing" : ""})`;
    if (inside.length < 3) return card({ kind: "waiting", tone: "flat", title, body: `${inside.length} day${inside.length === 1 ? "" : "s"} logged during this test. Three or four days of eating or drinking it is the minimum before comparing.` });
    if (before.length < 5) return card({ kind: "waiting", tone: "flat", title, body: `Fewer than 5 days logged in the two weeks before this test started — no baseline to compare against.` });
    const gi = gapInfo(inside, before), g = gi.g;
    const nxt = nextDays(inside.slice(-1));
    card({ kind: "compare", effect: g, n: Math.min(inside.length, before.length), tone: toneOf(g), title,
      body: `${inside.length} days during vs the two weeks before: energy ${avg(inside).toFixed(1)} vs ${avg(before).toFixed(1)}.${infTxt(inside, before)} Flare days ${Math.round(flareRate(inside) * 100)}% vs ${Math.round(flareRate(before) * 100)}%.${w.result !== "ongoing" ? ` You marked it ${w.result}.` : ""} ${say(gi, "No sign it's costing you.", "Looks like it may not suit you.", "No clear difference while testing it.")}` });
  });

  // ---- Every start and stop, not just tests ---------------------------------------
  // Two weeks before a change vs two weeks after. A new medication or
  // activity at baseline changes things too, so it gets judged the same way
  // a test does. Anything else that changed inside those four weeks is
  // named, and marks the result mixed: two changes at once can't be told
  // apart, which is the whole reason for testing one thing at a time.
  {
    const all = changesOf(data);
    all.forEach((ch) => {
      const items = ch.items.filter((x) => !(x.verb === "Started" && x.test));   // test windows have their own card
      if (!items.length) return;
      const before = inRange(addDays(ch.date, -14), addDays(ch.date, -1));
      const after = inRange(ch.date, addDays(ch.date, 13));
      if (before.length < 5) return;   // started before you were logging: no baseline, nothing honest to say
      const what = items.map((x) => `${x.verb.toLowerCase()} ${x.name}`).join(", ");
      const title = items.length === 1 ? `${items[0].verb} ${items[0].name}` : `Changes on ${new Date(ch.date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
      const others = all.filter((o) => o.date !== ch.date && o.date >= addDays(ch.date, -14) && o.date <= addDays(ch.date, 13)).flatMap((o) => o.items.map((x) => `${x.verb.toLowerCase()} ${x.name}`));
      const tangled = items.length > 1 || others.length > 0;
      const note = (items.length > 1 ? ` These happened on the same day (${what}), so their effects can't be separated.` : "") + (others.length ? ` Also within two weeks either side: ${others.join(", ")} — so this can't be read on its own.` : "");
      if (after.length < 5) return card({ kind: "waiting", tone: "flat", title, body: `${after.length} day${after.length === 1 ? "" : "s"} logged since. Five is the minimum before comparing against the two weeks before.${note}` });
      const gi = gapInfo(after, before), g = gi.g;
      card({ kind: "compare", mixed: tangled, effect: g, n: Math.min(before.length, after.length), span: 28, tone: tangled ? "flat" : toneOf(g), title,
        body: `Two weeks after vs the two weeks before: energy ${avg(after).toFixed(1)} vs ${avg(before).toFixed(1)}.${infTxt(after, before)} Flare days ${Math.round(flareRate(after) * 100)}% vs ${Math.round(flareRate(before) * 100)}%.${note} ${say(gi, "Things improved after it.", "Things got worse after it.", "No clear difference either side of it.")}` });
    });
  }

  // ---- Day of week ------------------------------------------------------------------
  if (n >= 21) {
    const by = {};
    E.forEach((e) => { const d = new Date(e.date + "T12:00:00").getDay(); (by[d] ||= []).push(e); });
    const names = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const ranked = Object.entries(by).filter(([, a]) => a.length >= 3).map(([d, a]) => [names[d], avg(a), a.length]).sort((a, b) => b[1] - a[1]);
    if (ranked.length >= 4) {
      const top = ranked[0], bottom = ranked[ranked.length - 1], g = top[1] - bottom[1];
      card({ kind: "compare", effect: g, n: Math.min(top[2], bottom[2]), tone: "flat", title: "Day-of-week pattern",
        body: `${top[0]}s average ${top[1].toFixed(1)} energy, ${bottom[0]}s ${bottom[1].toFixed(1)}. ${say(g, "A gap that size usually points to something in the weekly rhythm — work, physical labor, or what you eat on those days.", "", "No real difference between days of the week.")}` });
    }
  }

  // ---- Activity -> next day ------------------------------------------------------------
  if (n >= 14) {
    const after = (lvl) => nextDays(E.filter((e) => e.activity === lvl));
    const hard = after("hard"), mod = after("moderate"), rest = [...after("rest"), ...after("light")];
    if (hard.length >= 3 && rest.length >= 3) {
      const gi = gapInfo(hard, rest), g = gi.g;
      card({ kind: "compare", effect: g, n: Math.min(hard.length, rest.length), tone: toneOf(g), title: "Day after hard activity",
        body: `Energy averages ${avg(hard).toFixed(1)} the day after a hard day, vs ${avg(rest).toFixed(1)} after rest or light days${mod.length >= 3 ? `, ${avg(mod).toFixed(1)} after moderate` : ""}.${infTxt(hard, rest)} ${say(gi, "Hard days seem to help rather than cost you. Worth trusting, carefully.", "That's a post-exertion pattern. The useful question isn't whether to stop — it's where the ceiling is. Moderate days are the place to look.", "No clear next-day cost from hard activity.")}` });
    }
  }

  // ---- Regimen (supplements and medications) -----------------------------------------
  const withReg = E.map((e) => ({ e, a: adherence(data, e, e.date) })).filter((x) => x.a);
  if (withReg.length >= 7) {
    const last14 = withReg.slice(-14);
    const pct = Math.round(100 * last14.reduce((s, x) => s + x.a.taken, 0) / last14.reduce((s, x) => s + x.a.due, 0));
    const full = withReg.filter((x) => x.a.taken === x.a.due).map((x) => x.e);
    const missed = withReg.filter((x) => x.a.taken < x.a.due).map((x) => x.e);
    const head = `${pct}% of doses taken over the last ${last14.length} logged days.`;
    if (full.length >= 4 && missed.length >= 4) {
      const gi = gapInfo(full, missed), g = gi.g;
      card({ kind: "compare", effect: g, n: Math.min(full.length, missed.length), tone: toneOf(g), title: "Regimen",
        body: `${head} Full-regimen days average ${avg(full).toFixed(1)} energy vs ${avg(missed).toFixed(1)} on days something was missed.${infTxt(full, missed)} ${say(gi, "The regimen is doing something — or the days you miss it are already bad days. Notes will tell you which.", "Days you miss things are actually better. Worth asking whether something in the stack is costing you.", "No visible difference between full and partial days.")}` });
    } else card({ kind: "info", tone: "flat", title: "Regimen", body: `${head}${missed.length < 4 ? " Not enough missed days to compare — which is fine, that's consistency." : ""}` });

    data.interventions.filter((i) => !usesStatus(i)).forEach((i) => {
      const days = E.filter((e) => i.start && i.start <= e.date && (!i.end || i.end >= e.date) && scheduledOn(i, e.date));
      const took = days.filter((e) => e.taken?.includes(i.id)), skip = days.filter((e) => !e.taken?.includes(i.id));
      if (took.length < 4 || skip.length < 3) return;
      const ta = nextDays(took), sa = nextDays(skip);
      const gi = pickGap(gapInfo(took, skip), ta.length >= 3 && sa.length >= 3 ? gapInfo(ta, sa) : null), g = gi.g, next = gi.nextI;
      card({ kind: "compare", mixed: gi.mixed, effect: g, n: Math.min(took.length, skip.length), tone: toneOf(g), title: `${i.name} — taken vs missed`,
        body: `Missed ${skip.length} of ${days.length} days. Energy ${avg(took).toFixed(1)} on days taken vs ${avg(skip).toFixed(1)} on days missed${next != null ? `; the following day ${avg(ta).toFixed(1)} vs ${avg(sa).toFixed(1)}` : ""}.${infTxt(took, skip)} ${say(gi, "Missing it seems to cost you.", "You do better without it. That's worth a deliberate test — switch it off for two weeks and watch.", "Missing it doesn't seem to move anything.")}` });
    });
  }

  // ---- Activities and treatments: done vs skipped ---------------------------------------
  // Skipping is data, not failure. Days left blank are excluded: no answer
  // isn't the same as a skip.
  data.interventions.filter(usesStatus).forEach((i) => {
    const sched = E.filter((e) => i.start && i.start <= e.date && (!i.end || i.end >= e.date) && scheduledOn(i, e.date));
    const days = sched.filter((e) => (e.activityStatus || {})[i.id]);
    if (days.length < 7) return;
    const st = (e) => e.activityStatus[i.id];
    const did = days.filter((e) => st(e) === "done" || st(e) === "modified"), skip = days.filter((e) => st(e) === "skipped");
    const blank = sched.length - days.length;
    const head = `Done ${did.length}, skipped ${skip.length} of ${days.length} answered days${blank ? ` (${blank} scheduled day${blank === 1 ? "" : "s"} left blank — not counted either way)` : ""}.`;
    if (did.length >= 4 && skip.length >= 3) {
      const da = nextDays(did), sa = nextDays(skip);
      if (da.length >= 3 && sa.length >= 3) {
        const gi = gapInfo(da, sa), g = gi.g;
        return card({ kind: "compare", effect: g, n: Math.min(da.length, sa.length), tone: toneOf(g), title: `${i.name} — done vs skipped`,
          body: `${head} Same day: energy ${avg(did).toFixed(1)} vs ${avg(skip).toFixed(1)} — but you likely skip on low days, so the same-day number mostly shows how you felt going in. The day after is the fairer test: energy ${avg(da).toFixed(1)} vs ${avg(sa).toFixed(1)}.${infTxt(da, sa)} ${say(gi, "Doing it seems to help the next day.", "It seems to cost you the next day. Worth trying a smaller version.", "No clear next-day difference.")}` });
      }
    }
    card({ kind: "waiting", tone: "flat", title: `${i.name} — done vs skipped`, body: `${head} Not enough of both to compare yet — this fills in as you go.` });
  });

  // ---- With vs without: drinks, one-offs, repeated off-plan foods ------------------------
  // One card per item so each lands in its own group.
  const withWithout = (label, by, min, note) => Object.entries(by).forEach(([k, set]) => {
    const withX = E.filter((e) => set.has(e.date)), without = E.filter((e) => !set.has(e.date));
    if (withX.length < min || without.length < 4) return;
    const wa = nextDays(withX), oa = nextDays(without);
    const gi = pickGap(gapInfo(withX, without), wa.length >= 3 && oa.length >= 3 ? gapInfo(wa, oa) : null), g = gi.g, next = gi.nextI;
    const flag = data.foods.some((fd) => fd.status === "not tolerated" && k.includes(fd.name.toLowerCase()));
    card({ kind: "compare", mixed: gi.mixed, effect: g, n: Math.min(withX.length, without.length), tone: flag ? "down" : gi.mixed ? "flat" : toneOf(g), title: `${label}: ${k}`,
      body: `${withX.length} days with it. Energy ${avg(withX).toFixed(1)} vs ${avg(without).toFixed(1)} without${next != null ? `; the next day ${avg(wa).toFixed(1)} vs ${avg(oa).toFixed(1)}` : ""}.${infTxt(withX, without)}${flag ? " Includes something marked not tolerated in your Index." : ""} ${say(gi, "Looks better with it.", "Looks worse with it.", "No clear difference.")}${note ? " " + note : ""}` });
  });
  const collect = (pick) => { const by = {}; E.forEach((e) => (pick(e) || []).forEach((x) => { const k = x.trim().toLowerCase(); if (k) (by[k] ||= new Set()).add(e.date); })); return by; };
  withWithout("Drink", collect((e) => (e.drinks || []).map((d) => d.name)), 4);
  withWithout("Outside the routine", collect((e) => (e.routineExtras || []).map((x) => x.name)), 3, "Something taken only on bad days will look worse here for that reason alone — check the notes before reading it as cause.");
  if (n >= 14) withWithout("Off-plan food", collect((e) => (e.extras || []).map((x) => x.items)), 3);

  // ---- Meal plan ---------------------------------------------------------------------------
  const withMeals = E.map((e) => ({ e, m: mealsOn(data, e, e.date) })).filter((x) => x.m);
  if (withMeals.length >= 7) {
    const onPlan = withMeals.filter((x) => x.m.eaten === x.m.planned).map((x) => x.e);
    const offPlan = withMeals.filter((x) => x.m.eaten < x.m.planned).map((x) => x.e);
    const pct = Math.round(100 * withMeals.reduce((s, x) => s + x.m.eaten, 0) / withMeals.reduce((s, x) => s + x.m.planned, 0));
    const head = `${pct}% of planned meals eaten across ${withMeals.length} logged days.`;
    if (onPlan.length >= 4 && offPlan.length >= 4) {
      const gi = gapInfo(onPlan, offPlan), g = gi.g;
      card({ kind: "compare", effect: g, n: Math.min(onPlan.length, offPlan.length), tone: toneOf(g), title: "Meal plan",
        body: `${head} On-plan days average ${avg(onPlan).toFixed(1)} energy vs ${avg(offPlan).toFixed(1)} when meals were skipped or swapped.${infTxt(onPlan, offPlan)} ${say(gi, "The plan is earning its keep.", "Off-plan days are better. Either the plan has something in it that doesn't suit you, or you go off-plan on easy days. Check the notes.", "No clear difference — the plan may be fine but not the lever.")}` });
    } else card({ kind: "info", tone: "flat", title: "Meal plan", body: `${head}${offPlan.length < 4 ? " Nearly always on plan — no comparison possible yet." : ""}` });
  }

  // ---- Unplanned food -> next day --------------------------------------------------------
  const withExtras = E.filter((e) => (e.extras || []).length > 0);
  if (withExtras.length >= 5 && n >= 14) {
    const xa = nextDays(withExtras), ca = nextDays(E.filter((e) => !(e.extras || []).length));
    if (xa.length >= 4 && ca.length >= 4) {
      const gi = gapInfo(xa, ca), g = gi.g;
      card({ kind: "compare", effect: g, n: Math.min(xa.length, ca.length), tone: toneOf(g), title: "Day after unplanned food",
        body: `Energy averages ${avg(xa).toFixed(1)} the day after you logged something off-plan, vs ${avg(ca).toFixed(1)} after clean days.${infTxt(xa, ca)} ${say(gi, "Extras aren't hurting — if anything the opposite.", "Something in the extras costs you the next day. Read those entries side by side — the repeated ingredient is the suspect.", "No next-day pattern from unplanned food so far.")}` });
    }
  }

  // ---- Workout plan ------------------------------------------------------------------------
  const withWo = E.map((e) => ({ e, w: workoutsOn(data, e, e.date) })).filter((x) => x.w?.planned);
  if (withWo.length >= 7) {
    const doneN = withWo.reduce((s, x) => s + x.w.done + x.w.mod, 0), planN = withWo.reduce((s, x) => s + x.w.planned, 0);
    const skipped = withWo.filter((x) => x.w.skip > 0);
    const full = withWo.filter((x) => x.w.done + x.w.mod === x.w.planned).map((x) => x.e);
    card({ kind: "info", tone: "flat", title: "Workout plan", body: `${Math.round(100 * doneN / planN)}% of planned workouts done across ${withWo.length} days${skipped.length ? `, with something skipped on ${skipped.length}` : ""}.` });
    const fa = nextDays(full), sa = nextDays(skipped.map((x) => x.e));
    if (fa.length >= 4 && sa.length >= 4) {
      const gi = gapInfo(fa, sa), g = gi.g;
      card({ kind: "compare", effect: g, n: Math.min(fa.length, sa.length), tone: toneOf(g), title: "Day after completing the plan",
        body: `Energy ${avg(fa).toFixed(1)} the day after a full workout day, vs ${avg(sa).toFixed(1)} after a day you scaled back.${infTxt(fa, sa)} ${say(gi, "Full days aren't costing you the next day. Room to hold steady or add slowly.", "The plan is above your ceiling right now. That doesn't mean stop — the next version should be smaller, built up from what you can repeat.", "No clear next-day difference. Steady ground.")}` });
    }
  }

  // ---- Notes ---------------------------------------------------------------------------------
  const flares = E.filter((e) => e.flare);
  if (flares.length >= 3) {
    const noted = flares.filter((e) => e.notes?.trim()).length;
    card({ kind: "info", tone: "flat", title: `${flares.length} flare days so far`, body: noted < flares.length ? `${flares.length - noted} of them have no notes. Flare days with notes are the most valuable entries you have — even "nothing was different" is useful.` : "Every flare has a note. Read them together sometime — the repeated word is usually the lead." });
  }
  const foodsOnly = data.foods.filter((x) => (x.kind || "food") === "food");
  const nt = foodsOnly.filter((x) => x.status === "not tolerated"), unk = foodsOnly.filter((x) => x.status === "unknown");
  if (foodsOnly.length >= 5) card({ kind: "info", tone: "flat", title: "Foods", body: `${foodsOnly.filter((x) => x.status === "tolerated").length} tolerated, ${nt.length} not, ${unk.length} untested. ${unk.length > 0 ? "Untested foods are your test queue — one at a time, three or four days each, only when nothing else is open." : "No untested foods left in the list."}` });

  return out.map((c) => ({ ...c, group: classify(c) }));
}
