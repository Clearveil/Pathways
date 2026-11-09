// Builds a report as plain data. That data is what gets saved, so a report
// reopened months later shows exactly what was exported, even if the
// underlying log has changed since.

import { addDays, today, logged, scheduleLabel, isActivity, usesStatus, scheduledOn, changesOf, testWindows, testStart, localDate, KIND_LABEL, INT_TYPE } from "./utils.js";
import { doseLabel } from "./dose.js";
import { buildInsights } from "./insights.js";

export const REPORT_MEASURES = [
  { key: "energy", label: "Energy", higherBetter: true },
  { key: "inflammation", label: "Inflammation", higherBetter: false },
  { key: "clarity", label: "Mental clarity", higherBetter: true },
  { key: "stress", label: "Stress", higherBetter: false },
];
const dayDiff = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
const mean = (xs) => { const v = xs.filter((x) => x != null); return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null; };
export const fmtDay = (ds, opts = { month: "short", day: "numeric", year: "numeric" }) => new Date(ds + "T12:00:00").toLocaleDateString("en-US", opts);

const FIELD_TEXT = { status: "status", days: "days", times: "times", doses_per_day: "how it's taken", start_date: "start date", end_date: "end date", intensity: "intensity", dose_unit: "dose unit", name: "name", category: "category", confidence: "confidence", kind: "section", size: "usual size", type: "section", dose_note: "note" };

export function buildReport(data, { from, to, title, email }) {
  const len = dayDiff(from, to) + 1;
  const prevTo = addDays(from, -1), prevFrom = addDays(from, -len);
  const inRange = data.entries.filter((e) => e.date >= from && e.date <= to).sort((a, b) => a.date.localeCompare(b.date));
  const E = inRange.filter(logged);
  const P = data.entries.filter((e) => logged(e) && e.date >= prevFrom && e.date <= prevTo);
  const byId = Object.fromEntries(data.interventions.map((i) => [i.id, i]));

  // ---- at a glance
  const measures = REPORT_MEASURES.map((m) => {
    const vals = E.map((e) => e[m.key]).filter((v) => v != null);
    return { ...m, avg: mean(vals), prev: mean(P.map((e) => e[m.key])), min: vals.length ? Math.min(...vals) : null, max: vals.length ? Math.max(...vals) : null, n: vals.length };
  }).filter((m) => m.n > 0);
  const flareDays = E.filter((e) => e.flare);
  const prevFlareRate = P.length ? P.filter((e) => e.flare).length / P.length : null;

  // ---- daily rows: chart, appendix and CSV
  const names = (ids) => (ids || []).map((id) => byId[id]?.name).filter(Boolean);
  const daily = inRange.map((e) => ({
    date: e.date, energy: e.energy ?? null, inflammation: e.inflammation ?? null, clarity: e.clarity ?? null, stress: e.stress ?? null,
    flare: e.flare ? (e.severity || 1) : null, activity: e.activity || "", notes: (e.notes || "").trim(),
    taken: names(e.taken).map((n) => { const id = data.interventions.find((i) => i.name === n)?.id; const d = (e.doses || {})[id]; return d != null ? `${n} (${d}${byId[id]?.doseUnit ? " " + byId[id].doseUnit : ""})` : n; }),
    done: Object.entries(e.activityStatus || {}).filter(([, s]) => s === "done" || s === "modified").map(([id]) => byId[id]?.name).filter(Boolean),
    skipped: Object.entries(e.activityStatus || {}).filter(([, s]) => s === "skipped").map(([id]) => byId[id]?.name).filter(Boolean),
    food: (e.extras || []).map((x) => `${x.items}${(x.qty || 1) > 1 ? ` ×${x.qty}` : ""}`),
    drinks: (e.drinks || []).map((x) => `${x.name}${x.size ? ` ${x.size}` : ""}${(x.qty || 1) > 1 ? ` ×${x.qty}` : ""}`),
    oneOffs: [...(e.extraWorkouts || []).map((x) => x.workout), ...(e.routineExtras || []).map((x) => x.name)],
  }));

  // ---- what changed: starts, stops, dose changes, plus status/schedule edits from the log
  const timeline = [];
  const seen = new Set();
  const push = (date, text) => { const k = date + "|" + text; if (!seen.has(k) && date >= from && date <= to) { seen.add(k); timeline.push({ date, text }); } };
  changesOf(data).forEach((ch) => ch.items.forEach((x) => push(ch.date, `${x.verb} ${x.name}${x.verb === "Started" && x.kind ? ` (${x.kind})` : ""}`)));
  (data.changes || []).forEach((c) => {
    const d = localDate(c.at);
    if (c.tbl === "entries" && c.action === "removed") return push(d, `Removed the log for ${fmtDay(c.name, { month: "short", day: "numeric" })}`);
    if (c.action === "changed" && c.field === "archived_at" && c.newValue) return push(d, `Removed ${c.name} from the Index`);
    if (c.action !== "changed" || ["dose_amount", "start_date", "end_date", "archived_at"].includes(c.field)) return;
    if (c.tbl === "foods" && c.field === "status") return push(d, `${c.name}: ${c.oldValue || "—"} → ${c.newValue}`);
    if (c.tbl === "interventions" && c.field === "status") return push(d, `${c.name}: ${c.oldValue} → ${c.newValue}`);
    if (c.tbl === "interventions" && ["days", "times", "doses_per_day", "intensity"].includes(c.field)) return push(d, `${c.name}: ${FIELD_TEXT[c.field]} changed`);
  });
  timeline.sort((a, b) => a.date.localeCompare(b.date));

  // ---- findings: computed from everything logged up to the report's end date
  const cards = buildInsights({ ...data, entries: data.entries.filter((e) => e.date <= to) });
  const findings = cards.filter((c) => ["macro", "micro", "none"].includes(c.group)).map((c) => ({ group: c.group, title: c.title, body: c.body }));

  // ---- tests that overlap the period, with their result card if there is one
  const tests = [];
  data.interventions.filter((i) => ["testing", "established", "discontinued"].includes(i.status) && i.start).forEach((i) => {
    const s = testStart(data, i), e = i.end || today();
    if (s <= to && e >= from) tests.push({ name: i.name, kind: isActivity(i) ? "activity" : i.type, from: s, to: e, status: i.status, result: cards.find((c) => c.title.startsWith(i.name + " ("))?.body || null });
  });
  testWindows(data).forEach((w) => { if (w.from <= to && w.to >= from) tests.push({ name: w.name, kind: w.kind, from: w.from, to: w.to, status: w.result, result: cards.find((c) => c.title.startsWith(w.name + " ("))?.body || null }); });

  // ---- routine during the period, with how often it was taken / done
  const routine = INT_TYPE.map((kind) => {
    const items = data.interventions.filter((i) => (isActivity(i) ? "activity" : i.type) === kind && i.start && i.start <= to && (!i.end || i.end >= from)).map((i) => {
      const days = E.filter((e) => e.date >= i.start && (!i.end || e.date <= i.end) && scheduledOn(i, e.date));
      let adherence = null;
      if (days.length) {
        if (usesStatus(i)) {
          const done = days.filter((e) => ["done", "modified"].includes((e.activityStatus || {})[i.id])).length, skipped = days.filter((e) => (e.activityStatus || {})[i.id] === "skipped").length;
          adherence = `done ${done}, skipped ${skipped} of ${days.length} logged days`;
        } else {
          const t = days.filter((e) => e.taken?.includes(i.id)).length;
          adherence = `taken ${t} of ${days.length} logged days (${Math.round((100 * t) / days.length)}%)`;
        }
      }
      return { name: i.name, amount: isActivity(i) ? [i.doseNote, i.intensity].filter(Boolean).join(" · ") : doseLabel(i), schedule: scheduleLabel(i), since: i.start, ended: i.end || "", status: i.status, removed: !!i.archivedAt, adherence };
    });
    return { kind, label: KIND_LABEL[kind], items };
  }).filter((g) => g.items.length);

  // ---- foods and drinks by tolerance
  const tol = (kind) => {
    const list = data.foods.filter((f) => (f.kind || "food") === kind && !f.archivedAt);
    return { tolerated: list.filter((f) => f.status === "tolerated").map((f) => f.name), not: list.filter((f) => f.status === "not tolerated").map((f) => f.name), testing: list.filter((f) => f.status === "testing").map((f) => f.name), unknown: list.filter((f) => f.status === "unknown").length };
  };

  // ---- one plain-language summary sentence
  const en = measures.find((m) => m.key === "energy");
  const bits = [];
  if (en) bits.push(`Energy averaged ${en.avg}${en.prev != null ? ` (${en.avg - en.prev >= 0.05 ? "up" : en.avg - en.prev <= -0.05 ? "down" : "level"} from ${en.prev} the period before)` : ""}`);
  bits.push(`${flareDays.length} flare day${flareDays.length === 1 ? "" : "s"} (${E.length ? Math.round((100 * flareDays.length) / E.length) : 0}% of logged days${prevFlareRate != null ? `, vs ${Math.round(prevFlareRate * 100)}% before` : ""})`);
  if (tests.length) bits.push(`${tests.length} test${tests.length === 1 ? "" : "s"} in this period`);
  if (timeline.length) bits.push(`${timeline.length} change${timeline.length === 1 ? "" : "s"} to the routine`);

  return {
    version: 1, title: title || "", from, to, generatedAt: new Date().toISOString(), email: email || "",
    daysInRange: len, daysLogged: E.length, summary: bits.join(". ") + ".",
    measures, flares: flareDays.map((e) => ({ date: e.date, severity: e.severity || null, notes: (e.notes || "").trim() })),
    daily, timeline, tests, findings, routine, foods: tol("food"), drinks: tol("drink"),
  };
}

// Spreadsheet version: one row per day, every field.
export function reportCSV(c) {
  const q = (v) => { const s = Array.isArray(v) ? v.join("; ") : v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const head = ["date", "energy", "inflammation", "mental_clarity", "stress", "flare_severity", "activity_level", "taken", "activities_done", "activities_skipped", "one_offs", "food", "drinks", "notes"];
  const rows = c.daily.map((d) => [d.date, d.energy, d.inflammation, d.clarity, d.stress, d.flare, d.activity, d.taken, d.done, d.skipped, d.oneOffs, d.food, d.drinks, d.notes].map(q).join(","));
  return [head.join(","), ...rows].join("\n");
}
