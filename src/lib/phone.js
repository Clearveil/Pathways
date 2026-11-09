// Phone numbers: stored in E.164 form (+15551234567) so they're usable by
// any texting service later. A bare 10-digit number is assumed to be US/Canada.
export function normalizePhone(input) {
  const raw = String(input || "").trim();
  if (!raw) return { ok: true, value: null };
  const digits = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && digits.length >= 8 && digits.length <= 15) return { ok: true, value: "+" + digits };
  if (digits.length === 10) return { ok: true, value: "+1" + digits };
  if (digits.length === 11 && digits.startsWith("1")) return { ok: true, value: "+" + digits };
  return { ok: false, value: null };
}

export function formatPhone(e164) {
  if (!e164) return "";
  const m = e164.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : e164;
}

// The consent wording, in one place so signup and Account say the same thing.
export const MARKETING_CONSENT =
  "Text me occasional news and offers from Pathways. Optional — not needed to use the app. Message and data rates may apply; reply STOP to opt out anytime.";
