// Парсер vCard и MECARD в общий объект полей контакта.

export interface ContactFromQr {
  name?: string;
  phone?: string;
  email?: string;
  contact_company?: string;
  role_title?: string;
  website?: string;
  telegram?: string;
  whatsapp?: string;
}

export function parseQrContact(data: string): ContactFromQr | null {
  const text = data.trim();
  if (!text) return null;

  if (text.toUpperCase().startsWith("BEGIN:VCARD")) return parseVCard(text);
  if (text.toUpperCase().startsWith("MECARD:")) return parseMeCard(text);

  // Telegram link
  if (/^https?:\/\/(t\.me|telegram\.me)\//i.test(text)) {
    return { telegram: text };
  }
  // WhatsApp link
  if (/^https?:\/\/wa\.me\//i.test(text)) {
    return { whatsapp: text };
  }
  // Pure URL
  if (/^https?:\/\//i.test(text)) {
    return { website: text };
  }
  // Pure email
  if (text.startsWith("mailto:") || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
    return { email: text.replace(/^mailto:/, "") };
  }
  // Pure phone
  if (text.startsWith("tel:") || /^[+\d][\d\s()-]{6,}$/.test(text)) {
    return { phone: text.replace(/^tel:/, "") };
  }
  return null;
}

function parseVCard(text: string): ContactFromQr {
  const out: ContactFromQr = {};
  const lines = text.split(/\r?\n/);
  for (const raw of lines) {
    const colon = raw.indexOf(":");
    if (colon === -1) continue;
    const key = raw.slice(0, colon).split(";")[0].toUpperCase();
    const val = raw.slice(colon + 1).trim();
    if (!val) continue;
    switch (key) {
      case "FN":
        out.name = val;
        break;
      case "N":
        if (!out.name) {
          // Family;Given;Middle;Prefix;Suffix
          const parts = val.split(";").filter(Boolean);
          out.name = [parts[1], parts[0]].filter(Boolean).join(" ").trim() || val;
        }
        break;
      case "TEL":
        if (!out.phone) out.phone = val;
        break;
      case "EMAIL":
        if (!out.email) out.email = val;
        break;
      case "ORG":
        out.contact_company = val.split(";")[0];
        break;
      case "TITLE":
        out.role_title = val;
        break;
      case "URL":
        if (!out.website) out.website = val;
        break;
      case "X-SOCIALPROFILE":
      case "X-TELEGRAM":
        if (val.toLowerCase().includes("telegram") || val.startsWith("@")) out.telegram = val;
        break;
    }
  }
  return out;
}

function parseMeCard(text: string): ContactFromQr {
  const body = text.replace(/^MECARD:/i, "").replace(/;;\s*$/, "");
  const out: ContactFromQr = {};
  const segments = body.split(";").filter(Boolean);
  for (const seg of segments) {
    const colon = seg.indexOf(":");
    if (colon === -1) continue;
    const key = seg.slice(0, colon).toUpperCase();
    const val = seg.slice(colon + 1).trim();
    if (!val) continue;
    if (key === "N") {
      const parts = val.split(",").filter(Boolean);
      out.name = [parts[1], parts[0]].filter(Boolean).join(" ").trim() || val;
    } else if (key === "TEL" && !out.phone) out.phone = val;
    else if (key === "EMAIL" && !out.email) out.email = val;
    else if (key === "ORG") out.contact_company = val;
    else if (key === "URL") out.website = val;
    else if (key === "TITLE") out.role_title = val;
  }
  return out;
}
