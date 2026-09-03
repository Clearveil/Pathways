// Insights are arithmetic over small samples. They must say "not enough data"
// when that is true and "no clear difference" when that is the result.
// Never inflate a weak signal into a recommendation.

import { today, addDays, now, mealsOn, workoutsOn, logged, adherence } from "./utils.js";

export function buildInsights(data) {
  const out = [];
  const E = data.entries.filter(logged);
  const n = E.length;
  const avg = (a) => a.length ? a.reduce((s, e) => s + e.energy, 0) / a.length : null;
  const flareRate = (a) => a.length ? a.filter((e) => e.flare).length / a.length : null;
  const inf = (a) => { const b = a.filter((e) => e.inflammation != null); return b.length ? b.reduce((s, e) => s + e.inflammation, 0) / b.length : null; };
  const infTxt = (a, b) => (inf(a) != null && inf(b) != null) ? ` Inflammation ${inf(a).toFixed(1)} vs ${inf(b).toFixed(1)}.` : "";
  const inRange = (s, e) => E.filter((x) => x.date >= s && x.date <= e);

  if (n === 0) { out.push({ tone: "flat", title: "Nothing to read yet", body: "Insights appear once there's data. The first two weeks are baseline — the goal is to see what a normal week looks like before changing anything." }); return out; }
  if (n < 7) { out.push({ tone: "flat", title: `${n} day${n > 1 ? "s" : ""} logged`, body: "Too early to draw anything. A week of entries gives a rough baseline; two weeks is when patterns start to be worth looking at." }); }

  // Recent vs earlier
  if (n >= 14) {
    const last = E.slice(-7), prev = E.slice(-14, -7);
    const d = avg(last) - avg(prev);
    const tone = d > 0.7 ? "up" : d < -0.7 ? "down" : "flat";
    out.push({ tone, title: "This week vs last week", body: `Average energy ${avg(last).toFixed(1)} vs ${avg(prev).toFixed(1)}. ${tone === "flat" ? "About the same — that's a stable baseline, which is what you want before testing something." : tone === "up" ? "Better. Check the notes from this week for what might explain it." : "Lower. Look at what was different — the notes column is where the answer usually is."} Flare days: ${last.filter((e) => e.flare).length} vs ${prev.filter((e) => e.flare).length}.${infTxt(last, prev)}` });
  }

  // Each tested intervention
  data.interventions.filter((i) => i.start && ["testing", "established", "discontinued"].includes(i.status)).forEach((i) => {
    const end = i.end || today();
    const inside = inRange(i.start, end);
    const before = inRange(addDays(i.start, -14), addDays(i.start, -1));
    if (inside.length < 5) { out.push({ tone: "flat", title: i.name, body: `${inside.length} day${inside.length === 1 ? "" : "s"} of data inside this window. Five is the minimum before comparing; ten to fourteen is better.` }); return; }
    if (before.length < 5) { out.push({ tone: "flat", title: i.name, body: `${inside.length} days logged during, but fewer than 5 days logged before it started — no baseline to compare against. The comparison would be meaningless.` }); return; }
    const d = avg(inside) - avg(before);
    const fd = flareRate(inside) - flareRate(before);
    const tone = d > 0.8 ? "up" : d < -0.8 ? "down" : "flat";
    out.push({ tone, title: `${i.name} (${inside.length} days)`, body: `Energy averaged ${avg(inside).toFixed(1)} during vs ${avg(before).toFixed(1)} in the two weeks before. ${tone === "up" ? "That's a real-looking difference — worth keeping, but one window isn't proof." : tone === "down" ? "Lower than before. If nothing else changed, that's a signal to stop and see if it recovers." : "No clear difference. That's a valid result — it means this one probably isn't doing much either way."} Flare days: ${Math.round(flareRate(inside) * 100)}% vs ${Math.round(flareRate(before) * 100)}%${Math.abs(fd) > 0.15 ? (fd < 0 ? " — fewer, which matters more than the energy number." : " — more, which matters more than the energy number.") : "."}${infTxt(inside, before)}` });
  });

  // Day of week
  if (n >= 21) {
    const by = {};
    E.forEach((e) => { const d = new Date(e.date + "T12:00:00").getDay(); (by[d] ||= []).push(e); });
    const names = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
    const ranked = Object.entries(by).filter(([, a]) => a.length >= 3).map(([d, a]) => [names[d], avg(a)]).sort((a, b) => b[1] - a[1]);
    if (ranked.length >= 4 && ranked[0][1] - ranked[ranked.length - 1][1] >= 1.2) {
      out.push({ tone: "flat", title: "Day-of-week pattern", body: `${ranked[0][0]}s average ${ranked[0][1].toFixed(1)}, ${ranked[ranked.length-1][0]}s ${ranked[ranked.length-1][1].toFixed(1)}. A gap that size usually points to something in the weekly rhythm — work, church, physical labor, or what you eat on those days.` });
    }
  }

  // Activity -> next day
  if (n >= 14) {
    const byDate = Object.fromEntries(E.map((e) => [e.date, e]));
    const after = (lvl) => E.filter((e) => e.activity === lvl).map((e) => byDate[addDays(e.date, 1)]).filter(Boolean);
    const hard = after("hard"), mod = after("moderate"), rest = [...after("rest"), ...after("light")];
    if (hard.length >= 3 && rest.length >= 3) {
      const d = avg(hard) - avg(rest);
      const tone = d < -1 ? "down" : d > 0.5 ? "up" : "flat";
      out.push({ tone, title: "Day after hard activity", body: `Energy averages ${avg(hard).toFixed(1)} the day after a hard day, vs ${avg(rest).toFixed(1)} after rest or light days${mod.length >= 3 ? `, ${avg(mod).toFixed(1)} after moderate` : ""}. ${tone === "down" ? "That's a post-exertion pattern. The useful question isn't whether to stop — it's where the ceiling is. Moderate days are the place to look." : tone === "up" ? "Hard days seem to help rather than cost you. Worth trusting, carefully." : "No clear next-day cost from hard activity. Keep an eye on it as the sample grows."}` });
    }
  }

  // Regimen adherence
  const withReg = E.map((e) => ({ e, a: adherence(data, e, e.date) })).filter((x) => x.a);
  if (withReg.length >= 7) {
    const last14 = withReg.slice(-14);
    const pct = Math.round(100 * last14.reduce((s, x) => s + x.a.taken, 0) / last14.reduce((s, x) => s + x.a.due, 0));
    const full = withReg.filter((x) => x.a.taken === x.a.due).map((x) => x.e);
    const missed = withReg.filter((x) => x.a.taken < x.a.due).map((x) => x.e);
    let body = `${pct}% of doses taken over the last ${last14.length} logged days.`;
    let tone = "flat";
    if (full.length >= 4 && missed.length >= 4) {
      const d = avg(full) - avg(missed);
      tone = d > 0.8 ? "up" : d < -0.8 ? "down" : "flat";
      body += ` Full-regimen days average ${avg(full).toFixed(1)} energy vs ${avg(missed).toFixed(1)} on days something was missed.${infTxt(full, missed)}`;
      body += tone === "up" ? " The regimen is doing something — or the days you skip it are already bad days. Notes will tell you which." : tone === "down" ? " Days you miss things are actually better. Worth asking whether something in the stack is costing you." : " No visible difference between full and partial days.";
    } else if (missed.length < 4) {
      body += " Not enough missed days to compare — which is fine, that's consistency.";
    }
    out.push({ tone, title: "Regimen", body });

    // per-supplement missed vs taken
    const byDate = Object.fromEntries(E.map((e) => [e.date, e]));
    data.interventions.filter((i) => i.type !== "lifestyle").forEach((i) => {
      const days = E.filter((e) => i.start && i.start <= e.date && (!i.end || i.end >= e.date));
      const took = days.filter((e) => e.taken?.includes(i.id)), skip = days.filter((e) => !e.taken?.includes(i.id));
      if (took.length < 4 || skip.length < 3) return;
      const nextAfter = (arr) => arr.map((e) => byDate[addDays(e.date, 1)]).filter(Boolean);
      const ta = nextAfter(took), sa = nextAfter(skip);
      const same = avg(took) - avg(skip);
      const next = (ta.length >= 3 && sa.length >= 3) ? avg(ta) - avg(sa) : null;
      const tone = same > 0.8 || (next != null && next > 0.8) ? "up" : same < -0.8 || (next != null && next < -0.8) ? "down" : "flat";
      out.push({ tone, title: `${i.name} — taken vs missed`, body: `Missed ${skip.length} of ${days.length} days. Energy ${avg(took).toFixed(1)} on days taken vs ${avg(skip).toFixed(1)} on days missed${next != null ? `; the following day ${avg(ta).toFixed(1)} vs ${avg(sa).toFixed(1)}` : ""}.${infTxt(took, skip)} ${tone === "up" ? "Missing it seems to cost you." : tone === "down" ? "You do better without it. That's worth a deliberate test — switch it off for two weeks and watch." : "Missing it doesn't seem to move anything."}` });
    });
  }

  // Meal plan adherence
  const withMeals = E.map((e) => ({ e, m: mealsOn(data, e, e.date) })).filter((x) => x.m);
  if (withMeals.length >= 7) {
    const onPlan = withMeals.filter((x) => x.m.eaten === x.m.planned).map((x) => x.e);
    const offPlan = withMeals.filter((x) => x.m.eaten < x.m.planned).map((x) => x.e);
    const pct = Math.round(100 * withMeals.reduce((s, x) => s + x.m.eaten, 0) / withMeals.reduce((s, x) => s + x.m.planned, 0));
    let tone = "flat", body = `${pct}% of planned meals eaten across ${withMeals.length} logged days.`;
    if (onPlan.length >= 4 && offPlan.length >= 4) {
      const d = avg(onPlan) - avg(offPlan);
      tone = d > 0.8 ? "up" : d < -0.8 ? "down" : "flat";
      body += ` On-plan days average ${avg(onPlan).toFixed(1)} energy vs ${avg(offPlan).toFixed(1)} when meals were skipped or swapped.${infTxt(onPlan, offPlan)}`;
      body += tone === "up" ? " The plan is earning its keep. Off-plan days with notes will show which swaps cost the most." : tone === "down" ? " Off-plan days are better. Either the plan has something in it that doesn't suit you, or you go off-plan on easy days. Check the notes." : " No clear difference — which might mean the plan is fine but not the lever.";
    } else if (offPlan.length < 4) body += " Nearly always on plan — no comparison possible yet.";
    out.push({ tone, title: "Meal plan", body });
  }

  // Unplanned food -> next day
  const withExtras = E.filter((e) => (e.extras || []).length > 0);
  if (withExtras.length >= 5 && n >= 14) {
    const byD = Object.fromEntries(E.map((e) => [e.date, e]));
    const after = (arr) => arr.map((e) => byD[addDays(e.date, 1)]).filter(Boolean);
    const clean = E.filter((e) => !(e.extras || []).length);
    const xa = after(withExtras), ca = after(clean);
    if (xa.length >= 4 && ca.length >= 4) {
      const d = avg(xa) - avg(ca);
      const tone = d < -0.8 ? "down" : d > 0.8 ? "up" : "flat";
      out.push({ tone, title: "Day after unplanned food", body: `Energy averages ${avg(xa).toFixed(1)} the day after you logged something off-plan, vs ${avg(ca).toFixed(1)} after clean days.${infTxt(xa, ca)} ${tone === "down" ? "Something in the extras costs you the next day. Read those entries side by side — the repeated ingredient is the suspect." : tone === "up" ? "Extras aren't hurting — if anything the opposite. The plan might be missing something you need." : "No next-day pattern from unplanned food so far."}` });
    }
  }

  // Repeated unplanned items, flagged against the foods list
  {
    const byD = Object.fromEntries(E.map((e) => [e.date, e]));
    const items = {};
    E.forEach((e) => (e.extras || []).forEach((m) => { const k = m.items.toLowerCase().trim(); (items[k] ||= []).push(e.date); }));
    const repeats = Object.entries(items).filter(([, ds]) => ds.length >= 3);
    if (repeats.length && n >= 14) {
      const lines = repeats.map(([k, ds]) => {
        const next = ds.map((d) => byD[addDays(d, 1)]).filter(Boolean);
        const others = E.filter((e) => !ds.includes(e.date));
        const dI = (next.length >= 3 && inf(next) != null && inf(others) != null) ? inf(next) - inf(others) : null;
        const flag = data.foods.some((fd) => fd.status === "not tolerated" && k.includes(fd.name.toLowerCase()));
        return `${k} (${ds.length}×)${dI != null ? `: inflammation ${dI > 0 ? "+" : ""}${dI.toFixed(1)} next day` : ""}${flag ? " — includes something marked not tolerated" : ""}`;
      });
      const flagged = lines.some((l) => l.includes("not tolerated"));
      out.push({ tone: flagged ? "down" : "flat", title: "Foods you keep logging off-plan", body: lines.join(". ") + ". Under about 1 point is noise at this sample size." });
    }
  }

  // Workout plan
  const withWo = E.map((e) => ({ e, w: workoutsOn(data, e, e.date) })).filter((x) => x.w?.planned);
  if (withWo.length >= 7) {
    const doneN = withWo.reduce((s, x) => s + x.w.done, 0), planN = withWo.reduce((s, x) => s + x.w.planned, 0);
    const skipped = withWo.filter((x) => x.w.skip > 0);
    const full = withWo.filter((x) => x.w.done === x.w.planned).map((x) => x.e);
    let body = `${Math.round(100 * doneN / planN)}% of planned workouts completed across ${withWo.length} days${skipped.length ? `, with something skipped on ${skipped.length}` : ""}.`;
    if (skipped.length >= 3) {
      const sd = skipped.map((x) => x.e);
      body += ` Energy on days you skipped averaged ${avg(sd).toFixed(1)}${full.length >= 3 ? ` vs ${avg(full).toFixed(1)} on days you completed the plan` : ""}.`;
      if (full.length >= 3) body += avg(sd) < avg(full) - 0.8 ? " You're skipping on low days — that's the plan bending to the body, which is how it should work." : avg(sd) > avg(full) + 0.8 ? " You're skipping on good days, which usually means something other than symptoms is getting in the way." : " Skips don't track with how you felt. Worth asking what actually drives them.";
    }
    out.push({ tone: "flat", title: "Workout plan", body });

    const byDw = Object.fromEntries(E.map((e) => [e.date, e]));
    const afterW = (arr) => arr.map((e) => byDw[addDays(e.date, 1)]).filter(Boolean);
    const fa = afterW(full), sa = afterW(skipped.map((x) => x.e));
    if (fa.length >= 4 && sa.length >= 4) {
      const d = avg(fa) - avg(sa);
      const t2 = d < -0.8 ? "down" : d > 0.8 ? "up" : "flat";
      out.push({ tone: t2, title: "Day after completing the plan", body: `Energy ${avg(fa).toFixed(1)} the day after a full workout day, vs ${avg(sa).toFixed(1)} after a day you scaled back.${infTxt(fa, sa)} ${t2 === "down" ? "The plan is above your ceiling right now. That doesn't mean stop — it means the next version should be smaller, built up from what you can repeat." : t2 === "up" ? "Full days aren't costing you the next day. Room to hold steady or add slowly." : "No clear next-day difference. Steady ground."}` });
    }
  }

  // Flares and notes
  const flares = E.filter((e) => e.flare);
  if (flares.length >= 3) {
    const noted = flares.filter((e) => e.notes?.trim()).length;
    out.push({ tone: "flat", title: `${flares.length} flare days so far`, body: noted < flares.length ? `${flares.length - noted} of them have no notes. Flare days with notes are the most valuable entries you have — even "nothing was different" is useful.` : "Every flare has a note. Read them together sometime — the repeated word is usually the lead." });
  }

  // Food status summary
  const nt = data.foods.filter((x) => x.status === "not tolerated"), unk = data.foods.filter((x) => x.status === "unknown");
  if (data.foods.length >= 5) out.push({ tone: "flat", title: "Foods", body: `${data.foods.filter((x) => x.status === "tolerated").length} tolerated, ${nt.length} not, ${unk.length} untested. ${unk.length > 0 ? "Untested foods are your test queue — one at a time, three or four days each, only when nothing else is open." : "No untested foods left in the list."}` });

  return out;
}
