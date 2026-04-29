/**
 * Browser-side OCR for business cards via tesseract.js (WASM).
 *
 * Languages downloaded on demand (~2-3 MB each, cached by the worker).
 */
import Tesseract from "tesseract.js";

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const PHONE_RE = /(?:\+?\d[\s().-]?){7,}\d/;
const URL_RE = /(?:https?:\/\/)?(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+(?:\/[^\s]*)?/;
const TG_RE = /(?:t\.me\/|@|telegram[:\s]+@?)([A-Za-z][A-Za-z0-9_]{3,31})/i;
const LINKEDIN_RE = /linkedin\.com\/in\/[A-Za-z0-9-]+/i;

const POSITION_HINTS = [
  "директор",
  "руководитель",
  "менеджер",
  "manager",
  "director",
  "ceo",
  "cto",
  "cfo",
  "founder",
  "owner",
  "lead",
  "head",
  "коммерческ",
  "продаж",
  "marketing",
  "маркетинг",
  "developer",
  "разработчик",
  "designer",
  "дизайнер",
  "engineer",
  "инженер",
];
const COMPANY_HINTS = ["ооо", "оао", "зао", "ао", "ип", "llc", "ltd", "inc", "gmbh"];

export interface OCRFields {
  text: string;
  name?: string;
  company?: string;
  position?: string;
  email?: string;
  phone?: string;
  website?: string;
  telegram?: string;
  linkedin?: string;
}

function looksLikePhone(s: string): boolean {
  const digits = (s.match(/\d/g) || []).length;
  return digits >= 7 && s.length <= 30;
}

export function parseFields(text: string): OCRFields {
  const out: OCRFields = { text };
  const email = text.match(EMAIL_RE)?.[0];
  if (email) out.email = email;
  const phone = text.match(PHONE_RE)?.[0];
  if (phone && looksLikePhone(phone)) out.phone = phone.trim();
  for (const m of text.matchAll(new RegExp(URL_RE, "g"))) {
    const u = m[0];
    if (!u.includes("@") && !u.toLowerCase().includes("t.me")) {
      out.website = u;
      break;
    }
  }
  const tg = text.match(TG_RE);
  if (tg) out.telegram = tg[1];
  const li = text.match(LINKEDIN_RE);
  if (li) out.linkedin = li[0];

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const ln of lines) {
    if (EMAIL_RE.test(ln) || URL_RE.test(ln) || looksLikePhone(ln)) continue;
    const low = ln.toLowerCase();
    if (!out.company && COMPANY_HINTS.some((h) => low.includes(h))) {
      out.company = ln;
      continue;
    }
    if (!out.position && POSITION_HINTS.some((h) => low.includes(h))) {
      out.position = ln;
      continue;
    }
    if (!out.name) {
      const words = ln.split(/\s+/).length;
      const hasDigit = /\d/.test(ln);
      if (words >= 2 && words <= 4 && !hasDigit) out.name = ln;
    }
  }
  return out;
}

export async function ocrImageBlob(blob: Blob): Promise<OCRFields> {
  const result = await Tesseract.recognize(blob, "rus+eng", {
    logger: () => {},
  });
  const text = result.data.text || "";
  return parseFields(text);
}
