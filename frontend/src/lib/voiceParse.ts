// Voice-transcript → contact-card fields parser.
// Pure heuristics + regex, no LLM. Russian-first.
//
// Goal: the user says something like
//   "Познакомился с Иваном Петровым, директор по продажам в компании Ромашка,
//    телефон восемь девятьсот девяносто девять сто двадцать три сорок пять
//    шестьдесят семь, email ivan собака romashka точка ру, это горячий лид"
// and the form fields auto-populate.
//
// Only fills fields that are still empty; never overwrites.

export interface VoiceFields {
  name?: string;
  company?: string;
  position?: string;
  email?: string;
  phone?: string;
  website?: string;
  telegram?: string;
  whatsapp?: string;
  status?: "hot" | "warm" | "cold" | "new";
  contact_type?: "client" | "partner" | "vendor" | "media" | "other";
}

// ---------- helpers ---------------------------------------------------------

const RU_DIGIT_WORDS: Record<string, string> = {
  "ноль": "0", "нуль": "0",
  "один": "1", "одна": "1",
  "два": "2", "две": "2",
  "три": "3",
  "четыре": "4",
  "пять": "5",
  "шесть": "6",
  "семь": "7",
  "восемь": "8",
  "девять": "9",
  "десять": "10",
  "одиннадцать": "11", "двенадцать": "12", "тринадцать": "13",
  "четырнадцать": "14", "пятнадцать": "15", "шестнадцать": "16",
  "семнадцать": "17", "восемнадцать": "18", "девятнадцать": "19",
  "двадцать": "20", "тридцать": "30", "сорок": "40", "пятьдесят": "50",
  "шестьдесят": "60", "семьдесят": "70", "восемьдесят": "80", "девяносто": "90",
  "сто": "100", "двести": "200", "триста": "300", "четыреста": "400",
  "пятьсот": "500", "шестьсот": "600", "семьсот": "700", "восемьсот": "800",
  "девятьсот": "900",
};

function digitsFromRussianWords(s: string): string {
  // Replace Russian number words with digits. Very lightweight — meant to
  // recover phone numbers that Web Speech API transcribed as words.
  const tokens = s.toLowerCase().split(/[\s,.-]+/);
  const out: string[] = [];
  for (const t of tokens) {
    if (RU_DIGIT_WORDS[t] !== undefined) {
      out.push(RU_DIGIT_WORDS[t]);
    } else {
      out.push(t);
    }
  }
  return out.join(" ");
}

function normalizePhone(raw: string): string | null {
  // Keep digits only.
  const digits = raw.replace(/\D+/g, "");
  if (digits.length < 10) return null;
  let d = digits;
  // Russian mobile: 8xxxxxxxxxx or 7xxxxxxxxxx → +7xxxxxxxxxx
  if (d.length === 11 && (d.startsWith("8") || d.startsWith("7"))) {
    d = "7" + d.slice(1);
    return "+" + d;
  }
  if (d.length === 10) {
    return "+7" + d;
  }
  if (d.length >= 10 && d.length <= 15) {
    return "+" + d;
  }
  return null;
}

// ---------- individual extractors ------------------------------------------

// Map spoken TLDs/punctuation to code form.
//   "ivan собака romashka точка ру"  →  "ivan@romashka.ru"
//   "yandex точка ком"               →  "yandex.com"
function normalizeSpokenAddress(text: string): string {
  return text
    .replace(/\s*собака\s*/gi, "@")
    .replace(/\s*\bat\b\s*/gi, "@")
    .replace(/\s*точка\s+ру(?![а-яё])/gi, ".ru")
    .replace(/\s*точка\s+ком(?![а-яё])/gi, ".com")
    .replace(/\s*точка\s+нет(?![а-яё])/gi, ".net")
    .replace(/\s*точка\s+орг(?![а-яё])/gi, ".org")
    .replace(/\s*точка\s+рф(?![а-яё])/gi, ".рф")
    .replace(/\s*точка\s+су(?![а-яё])/gi, ".su")
    .replace(/\s*точка\s+ай(?:о|-?о)?(?![а-яё])/gi, ".io")
    .replace(/\s*точка\s*/gi, ".")
    .replace(/\s+тире\s+/gi, "-")
    .replace(/\s+дефис\s+/gi, "-");
}

function extractEmail(text: string): string | undefined {
  const normalized = normalizeSpokenAddress(text);
  const m = normalized.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Zа-яё]{2,}/i);
  return m ? m[0].toLowerCase() : undefined;
}

function extractWebsite(text: string): string | undefined {
  const normalized = normalizeSpokenAddress(text);
  const m = normalized.match(
    /\b(?:https?:\/\/)?(?:www\.)?([a-zA-Z0-9-]+\.(?:ru|com|org|net|io|co|biz|info|su|рф))(?:\/[^\s]*)?\b/i,
  );
  if (!m) return undefined;
  let url = m[0].toLowerCase();
  if (!url.startsWith("http")) url = "https://" + url;
  return url;
}

function extractPhone(text: string): string | undefined {
  // 1) Try direct digit patterns.
  const direct = text.match(/(?:\+?\d[\d\s().-]{8,}\d)/);
  if (direct) {
    const n = normalizePhone(direct[0]);
    if (n) return n;
  }
  // 2) Try after Russian word-to-digit.
  const worded = digitsFromRussianWords(text);
  // Find sequences of 10+ digits separated by spaces.
  const m = worded.match(/(?:\d\s?){10,}/);
  if (m) {
    const n = normalizePhone(m[0]);
    if (n) return n;
  }
  return undefined;
}

function extractTelegram(text: string): string | undefined {
  const m = text.match(/(?:^|\s)@([a-zA-Z0-9_]{4,32})(?:\s|$|[.,])/);
  if (m) return m[1];
  const m2 = text.match(/телеграм[:\s]+@?([a-zA-Z0-9_]{4,32})/i);
  if (m2) return m2[1];
  return undefined;
}

function extractStatus(text: string): VoiceFields["status"] | undefined {
  const t = text.toLowerCase();
  if (/горячий\s*(лид|клиент|контакт)|горячая\s*тема|срочн|бюджет\s+есть/.test(t)) return "hot";
  if (/тёплый\s*(лид|клиент|контакт)|теплый\s*(лид|клиент|контакт)|интересуется|думают/.test(t)) return "warm";
  if (/холодный\s*(лид|клиент|контакт)|не\s+очень|пока\s+не\s+готов/.test(t)) return "cold";
  return undefined;
}

function extractContactType(text: string): VoiceFields["contact_type"] | undefined {
  const t = text.toLowerCase();
  if (/потенциальный\s+клиент|заказчик|покупатель/.test(t)) return "client";
  if (/партн[её]р/.test(t)) return "partner";
  if (/поставщик|вендор/.test(t)) return "vendor";
  if (/журналист|сми|блогер|пресса/.test(t)) return "media";
  return undefined;
}

// Position dictionary — prioritized (longest first wins).
// JS `\b` doesn't work for Cyrillic, so we use explicit (?:^|[\s,.!?]) anchors.
// Patterns match stem+suffix so inflected forms ("директора", "директором") also resolve.
const B = "(?:^|[\\s,.!?;:])";
const CY = "[а-яёa-z]";
const POSITIONS: Array<[RegExp, string]> = [
  [new RegExp(`${B}(генеральн${CY}+\\s+директор${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Генеральный директор"],
  [new RegExp(`${B}(коммерческ${CY}+\\s+директор${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Коммерческий директор"],
  [new RegExp(`${B}(технич${CY}+\\s+директор${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Технический директор"],
  [new RegExp(`${B}(финансов${CY}+\\s+директор${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Финансовый директор"],
  [new RegExp(`${B}(директор${CY}*\\s+по\\s+${CY}+)(?=[\\s,.!?;:]|$)`, "iu"), "$1"],
  [new RegExp(`${B}(директор${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Директор"],
  [new RegExp(`${B}(ceo)(?=[\\s,.!?;:]|$)`, "iu"), "CEO"],
  [new RegExp(`${B}(cto)(?=[\\s,.!?;:]|$)`, "iu"), "CTO"],
  [new RegExp(`${B}(cfo)(?=[\\s,.!?;:]|$)`, "iu"), "CFO"],
  [new RegExp(`${B}(cmo)(?=[\\s,.!?;:]|$)`, "iu"), "CMO"],
  [new RegExp(`${B}(основател${CY}+|фаундер|founder|co[-\\s]?founder)(?=[\\s,.!?;:]|$)`, "iu"), "Основатель"],
  [new RegExp(`${B}(владел${CY}+|собственн${CY}+)(?=[\\s,.!?;:]|$)`, "iu"), "Владелец"],
  [new RegExp(`${B}(руководител${CY}+\\s+отдел${CY}*(?:\\s+${CY}+)?)(?=[\\s,.!?;:]|$)`, "iu"), "$1"],
  [new RegExp(`${B}(руководител${CY}+)(?=[\\s,.!?;:]|$)`, "iu"), "Руководитель"],
  [new RegExp(`${B}(менеджер${CY}*\\s+по\\s+продаж${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Менеджер по продажам"],
  [new RegExp(`${B}(менеджер${CY}*\\s+по\\s+закупк${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Менеджер по закупкам"],
  [new RegExp(`${B}(менеджер${CY}*\\s+проект${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Менеджер проектов"],
  [new RegExp(`${B}(product\\s+manager|продакт(?:[-\\s]+менеджер${CY}*)?)(?=[\\s,.!?;:]|$)`, "iu"), "Product Manager"],
  [new RegExp(`${B}(маркетолог${CY}*|marketing\\s+manager)(?=[\\s,.!?;:]|$)`, "iu"), "Маркетолог"],
  [new RegExp(`${B}(закупщик${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Закупщик"],
  [new RegExp(`${B}(бухгалтер${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Бухгалтер"],
  [new RegExp(`${B}(инженер${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Инженер"],
  [new RegExp(`${B}(дизайнер${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Дизайнер"],
  [new RegExp(`${B}(разработчик${CY}*|developer)(?=[\\s,.!?;:]|$)`, "iu"), "Разработчик"],
  [new RegExp(`${B}(юрист${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Юрист"],
  [new RegExp(`${B}(архитектор${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Архитектор"],
  [new RegExp(`${B}(менеджер${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Менеджер"],
  [new RegExp(`${B}(специалист${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Специалист"],
  [new RegExp(`${B}(консультант${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Консультант"],
  [new RegExp(`${B}(ассистент${CY}*)(?=[\\s,.!?;:]|$)`, "iu"), "Ассистент"],
];

function titleCase(s: string): string {
  return s.replace(/\s+/g, " ").trim().replace(/\b(\w)/g, (_, c) => c.toUpperCase());
}

function extractPosition(text: string): string | undefined {
  for (const [re, out] of POSITIONS) {
    const m = text.match(re);
    if (m) {
      if (out.includes("$1")) {
        return titleCase(m[1]);
      }
      return out;
    }
  }
  return undefined;
}

// Company — look for ООО/АО/ИП/OOO/LLC markers or «компания Х» / «в компании Х» / «работает в Х» / «из Х».
// NB: JS `\b` is ASCII-word-boundary only → useless for Cyrillic. We use
// (?:^|[\s,.!?]) / (?=[\s,.!?]|$) as explicit boundaries instead.
function extractCompany(text: string): string | undefined {
  const L = "(?:^|[\\s,.!?(])"; // left boundary
  const R = "(?=[\\s,.!?)]|$)"; // right boundary
  const word = "[«\"]?([А-ЯЁа-яёA-Za-z0-9][^«\"»,.\\n]{1,50}?)[»\"]?";
  const patterns: RegExp[] = [
    // "ООО Ромашка" / "АО Весна" — keep the prefix.
    new RegExp(`${L}(ООО|ОАО|ЗАО|АО|ИП|ПАО|НКО)\\s+${word}${R}`, "iu"),
    // "компания Ромашка" / "в компании Ромашка".
    new RegExp(`${L}(?:в\\s+)?компани[яи]\\s+${word}${R}`, "iu"),
    // "работает в Ромашка" / "работает в компании Ромашка"  (last already covered).
    new RegExp(`${L}работае[тм]?\\s+в\\s+${word}${R}`, "iu"),
    // "из Ромашка".
    new RegExp(`${L}из\\s+${word}${R}`, "iu"),
  ];
  const BAD_TAIL = /^(том|этом|нём|нем|нашем|этой|себе|городе|москве|спб|санкт|наш[аего]*|наш[иеоу]*)$/i;
  const STRIP_TAIL = /\s+(?:директор[а-яё]*|менеджер[а-яё]*|телефон[а-яё]*|email|компани[яи]|работает|работал|специалист[а-яё]*)\b.*$/i;
  for (let i = 0; i < patterns.length; i++) {
    const m = text.match(patterns[i]);
    if (!m) continue;
    // For the "ООО" pattern, company name lives in group 2; for others, in group 1.
    const hasPrefix = i === 0;
    const prefix = hasPrefix ? m[1] : "";
    const raw = (hasPrefix ? m[2] : m[1] || "").trim();
    const cleaned = raw.replace(STRIP_TAIL, "").trim();
    if (cleaned.length >= 2 && cleaned.length <= 60 && !BAD_TAIL.test(cleaned)) {
      return (prefix ? prefix + " " : "") + cleaned;
    }
  }
  return undefined;
}

// Very rough Russian-name declension → nominative.
// Handles only the common instrumental / genitive / dative forms you meet when
// narrating a lead capture ("с Иваном Петровым" → "Иван Петров", "Алексея" → "Алексей").
// Not linguistically perfect — but significantly better than leaving the raw form.
function denormalizeRussianWord(w: string): string {
  // Female surnames ending in -ой / -ой / -ою → "-ая" (Ивановой → Иванова)
  if (/[а-яё]{3,}(ой|ою)$/i.test(w)) return w.replace(/(ой|ою)$/i, "а");
  // Male surname instrumental: Петровым → Петров, Сидоровым → Сидоров
  if (/[а-яё]{3,}(овым|евым|ёвым|иным|ыным)$/i.test(w)) return w.replace(/(овым|евым|ёвым|иным|ыным)$/i, (m) => m.slice(0, -2));
  // Female surname: Петровой → Петрова
  if (/[а-яё]{3,}(овой|евой|ёвой|иной|ыной)$/i.test(w)) return w.replace(/(овой|евой|ёвой|иной|ыной)$/i, (m) => m.slice(0, -2) + "а");
  // Male first-name instrumental: Иваном → Иван, Алексеем → Алексей, Дмитрием → Дмитрий
  if (/[а-яё]{2,}(ом|ем|ём)$/i.test(w) && w.length >= 4) return w.replace(/(ом|ем|ём)$/i, "");
  // Genitive/accusative male first-name: Ивана → Иван, Алексея → Алексей (leave "я" → "й"), Дмитрия → Дмитрий
  if (/[а-яё]{3,}ея$/i.test(w)) return w.replace(/ея$/i, "ей");
  if (/[а-яё]{3,}ия$/i.test(w)) return w.replace(/ия$/i, "ий");
  if (/[а-яё]{3,}а$/i.test(w) && !/(ова|ева|ёва|ина|ына|ская|цкая)$/i.test(w)) return w.replace(/а$/i, "");
  // Dative male first-name: Ивану → Иван, Алексею → Алексей
  if (/[а-яё]{3,}ею$/i.test(w)) return w.replace(/ею$/i, "ей");
  if (/[а-яё]{3,}ию$/i.test(w)) return w.replace(/ию$/i, "ий");
  if (/[а-яё]{3,}у$/i.test(w) && !/(ка|ша|ща)у$/i.test(w)) return w.replace(/у$/i, "");
  return w;
}

function nominalizeName(phrase: string, declined: boolean): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  const processed = words.map((w) => (declined ? titleCase(denormalizeRussianWord(w)) : titleCase(w)));
  return processed.join(" ").trim();
}

// Russian stop words that often follow the name in transcripts but aren't part of it.
const NAME_STOP_WORDS = /^(из|в|по|за|на|с|у|к|о|об|от|до|для|при|со|во|ко|он|она|это|там|тут|работает|работал|директор|менеджер|компани[яи]|представитель|закупщик|руководитель|генеральный|коммерческий|технический|финансовый|был|была|это|наш|наша|вот)$/i;

function stripTrailingStopWords(phrase: string): string {
  const words = phrase.split(/\s+/).filter(Boolean);
  while (words.length > 0 && NAME_STOP_WORDS.test(words[words.length - 1])) {
    words.pop();
  }
  return words.join(" ");
}

// Name — patterns used by salespeople: "зовут X Y", "это X Y", "познакомился с X Y", "встретил X".
// Declined triggers (need nominalization): познакомился с / встретил / общался с.
// Nominative triggers (leave as is): зовут / это / вот.
function extractName(text: string): string | undefined {
  // Explicit Cyrillic classes since JS `\w` doesn't include Cyrillic.
  const capWord = "[А-ЯЁA-Z][а-яёa-z]+";
  const capPair = `${capWord}(?:\\s+${capWord})?`;

  // Declined context — "с Иваном Петровым" → nominalize.
  const declinedRe = new RegExp(
    `(?:познакомил[а-яё]+\\s+с|встретил[а-яё]*|общал[а-яё]+\\s+с|позвонил[а-яё]*|разговаривал[а-яё]+\\s+с)\\s+(${capPair})`,
    "iu",
  );
  const declinedMatch = text.match(declinedRe);
  if (declinedMatch) {
    const stripped = stripTrailingStopWords(declinedMatch[1]);
    if (stripped) return nominalizeName(stripped, true);
  }

  // Nominative context — "зовут X", "это X", "вот X".
  const nominativeRe = new RegExp(
    `(?:зовут(?:\\s+(?:его|её))?|(?:^|\\s)(?:это|вот))\\s+(${capPair})`,
    "iu",
  );
  const nominativeMatch = text.match(nominativeRe);
  if (nominativeMatch) {
    const stripped = stripTrailingStopWords(nominativeMatch[1]);
    if (stripped) return nominalizeName(stripped, false);
  }

  // All-lowercase declined fallback.
  const lowerWord = "[а-яёa-z]{2,}";
  const lowerPair = `${lowerWord}(?:\\s+${lowerWord})?`;
  const lowerRe = new RegExp(
    `(?:познакомил[а-яё]+\\s+с|встретил[а-яё]*|общал[а-яё]+\\s+с)\\s+(${lowerPair})`,
    "iu",
  );
  const lowerMatch = text.match(lowerRe);
  if (lowerMatch) {
    const stripped = stripTrailingStopWords(lowerMatch[1]);
    if (stripped) return nominalizeName(stripped, true);
  }
  return undefined;
}

// ---------- public API ------------------------------------------------------

export function parseVoiceTranscript(raw: string): VoiceFields {
  if (!raw || raw.trim().length < 4) return {};
  const t = raw;
  const out: VoiceFields = {};
  const email = extractEmail(t);
  if (email) out.email = email;
  const phone = extractPhone(t);
  if (phone) out.phone = phone;
  const website = extractWebsite(t);
  if (website) out.website = website;
  const tg = extractTelegram(t);
  if (tg) out.telegram = tg;
  const company = extractCompany(t);
  if (company) out.company = company;
  const position = extractPosition(t);
  if (position) out.position = position;
  const name = extractName(t);
  if (name) out.name = name;
  const status = extractStatus(t);
  if (status) out.status = status;
  const ct = extractContactType(t);
  if (ct) out.contact_type = ct;
  return out;
}

// Russian label map for UI banner
export const VOICE_FIELD_LABELS: Record<keyof VoiceFields, string> = {
  name: "имя",
  company: "компания",
  position: "должность",
  email: "email",
  phone: "телефон",
  website: "сайт",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  status: "статус",
  contact_type: "тип",
};
