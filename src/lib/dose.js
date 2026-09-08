// Doses as numbers. A supplement carries doseAmount + doseUnit + doseNote;
// `dose` (the old free-text field) is kept as the display label so nothing
// that reads it breaks. Per day, entries.doses records the amount actually
// taken, which is what makes "I tried 400 instead of 200" a real data point.

export const DOSE_UNITS = ["mg", "mcg", "g", "IU", "ml", "drops", "capsule", "tablet", "scoop", "serving"];
const COUNT_UNITS = ["capsule", "tablet", "scoop", "serving"];
const ALIASES = {
  "µg": "mcg", ug: "mcg", iu: "IU", cap: "capsule", caps: "capsule", capsules: "capsule",
  tab: "tablet", tabs: "tablet", tablets: "tablet", drop: "drops", scoops: "scoop", servings: "serving",
  gram: "g", grams: "g", milligram: "mg", milligrams: "mg", microgram: "mcg", micrograms: "mcg",
};

export function normUnit(u) {
  if (!u) return "";
  const l = u.trim().toLowerCase();
  if (ALIASES[l]) return ALIASES[l];
  return DOSE_UNITS.find((x) => x.toLowerCase() === l) || u.trim();
}

// "200 mg, evening" -> { doseAmount: 200, doseUnit: "mg", doseNote: "evening" }
// "as directed"     -> { doseAmount: null, doseUnit: "", doseNote: "as directed" }
export function parseDose(text) {
  const s = String(text || "").trim();
  const m = s.match(/^(\d+(?:[.,]\d+)?)\s*([A-Za-zµ]+)?\s*[,;·-]?\s*(.*)$/);
  if (!m) return { doseAmount: null, doseUnit: "", doseNote: s };
  return { doseAmount: parseFloat(m[1].replace(",", ".")), doseUnit: normUnit(m[2]), doseNote: (m[3] || "").trim() };
}

export const fmtAmt = (n) => (n == null ? "" : Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100));

export function doseLabel(i) {
  if (i.doseAmount == null || i.doseAmount === "") return i.doseNote || i.dose || "";
  let u = i.doseUnit || "";
  if (COUNT_UNITS.includes(u) && i.doseAmount !== 1) u += "s";
  return `${fmtAmt(i.doseAmount)}${u ? " " + u : ""}${i.doseNote ? ", " + i.doseNote : ""}`;
}

// A sensible +/- increment: whole units for things you count, otherwise
// about a quarter of the planned amount snapped to a round number.
export function doseStep(amount, unit) {
  if (unit === "tablet") return 0.5;
  if (COUNT_UNITS.includes(unit) || unit === "drops") return 1;
  if (!amount || amount <= 0) return 1;
  const target = amount / 4;
  const nice = [0.25, 0.5, 1, 2.5, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
  return nice.reduce((best, n) => (Math.abs(n - target) < Math.abs(best - target) ? n : best), nice[0]);
}
