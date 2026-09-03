import { useRef } from "react";
import Papa from "papaparse";
import { uid, now, normDate } from "../lib/utils.js";
import Modal from "./Modal.jsx";
import CsvExample from "./CsvExample.jsx";

// Meal and workout plan importer: the guide dialog plus the CSV parsing.
// Lives outside Month so the share menu can open it from any view.
// Importing a date that already has a plan replaces that day's plan rows;
// logged entries are never touched.
const SPEC = {
  meals: {
    need: "date, meal, items", any: ["meal", "items"],
    row: (r, d) => ({ id: uid(), updatedAt: now(), date: d, meal: (r.meal || "meal").trim(), items: (r.items || "").trim() }),
    done: (n, days, bad) => `Loaded ${n} meals across ${days} days${bad ? `, skipped ${bad} with unreadable dates` : ""}. Jump to a date to see them.`,
    empty: "No usable rows. Each row needs a date and a meal or items.",
  },
  workouts: {
    need: "date, workout, details", any: ["workout", "details"],
    row: (r, d) => ({ id: uid(), updatedAt: now(), date: d, workout: (r.workout || "workout").trim(), details: (r.details || "").trim() }),
    done: (n, days, bad) => `Loaded ${n} workouts across ${days} days${bad ? `, skipped ${bad} unreadable` : ""}.`,
    empty: "No usable rows. Each row needs a date and a workout.",
  },
};

export default function PlanImport({ data, save, open, onClose, onMessage }) {
  const mealRef = useRef();
  const woRef = useRef();

  const importFile = (file, kind) => {
    const s = SPEC[kind];
    Papa.parse(file, { header: true, skipEmptyLines: true, transformHeader: (h) => h.trim().toLowerCase(), complete: (res) => {
      const cols = Object.keys(res.data[0] || {});
      if (!cols.includes("date")) { onMessage(`Couldn't find a "date" column. Found: ${cols.join(", ") || "nothing"}. Needs ${s.need}.`); return; }
      const bad = [];
      const rows = res.data.map((r) => {
        const d = r.date ? normDate(r.date) : null;
        if (r.date && !d) bad.push(r.date);
        return d && s.any.some((k) => r[k]) ? s.row(r, d) : null;
      }).filter(Boolean);
      if (!rows.length) { onMessage(bad.length ? `Couldn't read the dates (e.g. "${bad[0]}"). Use YYYY-MM-DD.` : s.empty); return; }
      const dates = new Set(rows.map((r) => r.date));
      save({ ...data, [kind]: [...(data[kind] || []).filter((x) => !dates.has(x.date)), ...rows] });
      onMessage(s.done(rows.length, dates.size, bad.length));
    } });
  };
  const pick = (ref, e) => { if (e.target.files[0]) importFile(e.target.files[0], ref === mealRef ? "meals" : "workouts"); e.target.value = ""; };

  return (
    <>
      <input ref={mealRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => pick(mealRef, e)} />
      <input ref={woRef} type="file" accept=".csv" style={{ display: "none" }} onChange={(e) => pick(woRef, e)} />
      {open && (
        <Modal title="Import a plan" onClose={onClose}>
          <p className="hint" style={{ marginTop: 0 }}>A CSV with a header row. Dates as YYYY-MM-DD. Importing a date that already has a plan replaces that day; what you've logged is never touched.</p>
          <div className="csv-grid">
            <div>
              <h3>Meal plan</h3>
              <CsvExample label="meal-plan-csv" columns={["date", "meal", "items"]} rows={[["2026-09-08", "Breakfast", "Eggs, spinach"], ["2026-09-08", "Lunch", "Chicken, rice"], ["2026-09-09", "Breakfast", "Oats, blueberries"]]} />
              <button className="btn" onClick={() => { onClose(); mealRef.current.click(); }}>Choose meal CSV</button>
            </div>
            <div>
              <h3>Workout plan</h3>
              <CsvExample label="workout-plan-csv" columns={["date", "workout", "details"]} rows={[["2026-09-08", "Walk", "30 min easy"], ["2026-09-09", "Rest", ""], ["2026-09-10", "Strength", "Upper, light"]]} />
              <button className="btn" onClick={() => { onClose(); woRef.current.click(); }}>Choose workout CSV</button>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
