import jsQR from "jsqr";

export interface ParsedCard {
  raw: string;
  format: "vcard" | "mecard" | "url" | "tel" | "email" | "telegram" | "text";
  name?: string;
  org?: string;
  position?: string;
  phone?: string;
  email?: string;
  url?: string;
  telegram?: string;
}

/** Try to detect a QR code in an image and parse its payload as a contact card. */
export async function scanQrFromDataUrl(dataUrl: string): Promise<ParsedCard | null> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  // downscale very large images for speed
  const max = 1200;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const code = jsQR(imageData.data, imageData.width, imageData.height, {
    inversionAttempts: "attemptBoth",
  });
  if (!code) return null;
  return parseQrPayload(code.data);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export function parseQrPayload(raw: string): ParsedCard {
  const trimmed = raw.trim();
  // VCARD
  if (/^BEGIN:VCARD/i.test(trimmed)) {
    return parseVCard(trimmed);
  }
  // MECARD
  if (/^MECARD:/i.test(trimmed)) {
    return parseMecard(trimmed);
  }
  // tg://, t.me/, telegram.me/
  const tgMatch = trimmed.match(/(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)/i);
  if (tgMatch) {
    return { raw: trimmed, format: "telegram", telegram: `@${tgMatch[1]}` };
  }
  if (/^tel:/i.test(trimmed)) {
    return { raw: trimmed, format: "tel", phone: trimmed.replace(/^tel:/i, "").trim() };
  }
  if (/^mailto:/i.test(trimmed)) {
    return { raw: trimmed, format: "email", email: trimmed.replace(/^mailto:/i, "").trim() };
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return { raw: trimmed, format: "url", url: trimmed };
  }
  return { raw: trimmed, format: "text" };
}

function parseVCard(raw: string): ParsedCard {
  const out: ParsedCard = { raw, format: "vcard" };
  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const [keyPart, ...rest] = line.split(":");
    if (!keyPart || rest.length === 0) continue;
    const key = keyPart.split(";")[0].toUpperCase();
    const value = rest.join(":").trim();
    if (!value) continue;
    switch (key) {
      case "FN":
        out.name = value;
        break;
      case "N":
        if (!out.name) {
          // Family;Given;Additional;Prefix;Suffix
          const parts = value.split(";");
          out.name = [parts[1], parts[0]].filter(Boolean).join(" ").trim();
        }
        break;
      case "ORG":
        out.org = value.split(";")[0];
        break;
      case "TITLE":
        out.position = value;
        break;
      case "EMAIL":
        if (!out.email) out.email = value;
        break;
      case "TEL":
        if (!out.phone) out.phone = value;
        break;
      case "URL":
        if (!out.url) out.url = value;
        break;
    }
  }
  return out;
}

function parseMecard(raw: string): ParsedCard {
  const out: ParsedCard = { raw, format: "mecard" };
  const body = raw.replace(/^MECARD:/i, "").replace(/;;\s*$/, "");
  for (const part of body.split(";")) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const key = part.slice(0, idx).toUpperCase();
    const value = part.slice(idx + 1).trim();
    if (!value) continue;
    switch (key) {
      case "N":
        out.name = value.replace(/,/g, " ");
        break;
      case "ORG":
        out.org = value;
        break;
      case "TITLE":
        out.position = value;
        break;
      case "TEL":
        if (!out.phone) out.phone = value;
        break;
      case "EMAIL":
        if (!out.email) out.email = value;
        break;
      case "URL":
        if (!out.url) out.url = value;
        break;
    }
  }
  return out;
}
