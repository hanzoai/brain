/**
 * Pure-JS RFC 2822 / 5322 email message parser.
 *
 * Extracts headers, the primary text/plain body, and attachment metadata.
 * For full multipart binary extraction, hand the message to
 * `hanzo-tools-fs` — this module is the brain-side parser that powers
 * search and link extraction.
 */

export interface EmailHeader {
  name: string;
  value: string;
}

export interface EmailAttachment {
  filename?: string;
  mimeType: string;
  size: number;
  /** Raw body slice — caller can persist. */
  body: Uint8Array;
}

export interface ParsedEmail {
  headers: EmailHeader[];
  from?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject?: string;
  date?: string;
  messageId?: string;
  /** Decoded text/plain body (first part if multipart). */
  textBody: string;
  /** HTML body if present. */
  htmlBody?: string;
  attachments: EmailAttachment[];
}

export function parseEmail(raw: string | Uint8Array): ParsedEmail {
  const text = typeof raw === "string" ? raw : new TextDecoder("utf-8").decode(raw);
  const split = splitHeadersAndBody(text);
  const headers = parseHeaders(split.headers);

  const get = (name: string): string | undefined => {
    const h = headers.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return h?.value;
  };

  const out: ParsedEmail = {
    headers,
    from: get("From"),
    to: parseAddresses(get("To")),
    cc: parseAddresses(get("Cc")),
    bcc: parseAddresses(get("Bcc")),
    subject: get("Subject"),
    date: get("Date"),
    messageId: get("Message-ID"),
    textBody: "",
    attachments: [],
  };

  const contentType = get("Content-Type") ?? "text/plain";
  if (contentType.toLowerCase().startsWith("multipart/")) {
    const boundary = contentType.match(/boundary="?([^"]+)"?/i)?.[1];
    if (boundary) parseMultipart(split.body, boundary, out);
    else out.textBody = split.body;
  } else if (contentType.toLowerCase().startsWith("text/html")) {
    out.htmlBody = split.body;
    out.textBody = stripHtml(split.body);
  } else {
    out.textBody = split.body;
  }
  return out;
}

function splitHeadersAndBody(text: string): { headers: string; body: string } {
  const idx = text.indexOf("\r\n\r\n");
  if (idx !== -1) return { headers: text.slice(0, idx), body: text.slice(idx + 4) };
  const idx2 = text.indexOf("\n\n");
  if (idx2 !== -1) return { headers: text.slice(0, idx2), body: text.slice(idx2 + 2) };
  return { headers: text, body: "" };
}

function parseHeaders(text: string): EmailHeader[] {
  const out: EmailHeader[] = [];
  const lines = text.split(/\r?\n/);
  let cur: EmailHeader | null = null;
  for (const line of lines) {
    if (/^[\s\t]/.test(line) && cur) {
      cur.value += " " + line.trim();
      continue;
    }
    const m = line.match(/^([!-9;-~]+):\s*(.*)$/);
    if (m) {
      if (cur) out.push(cur);
      cur = { name: m[1], value: m[2] };
    }
  }
  if (cur) out.push(cur);
  return out;
}

function parseAddresses(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseMultipart(body: string, boundary: string, out: ParsedEmail): void {
  const sep = `--${boundary}`;
  const end = `--${boundary}--`;
  const parts: string[] = [];
  let i = body.indexOf(sep);
  while (i !== -1) {
    const next = body.indexOf(sep, i + sep.length);
    const finish = body.indexOf(end, i + sep.length);
    const stop = finish !== -1 && (next === -1 || finish < next) ? finish : next;
    if (stop === -1) break;
    parts.push(body.slice(i + sep.length, stop).replace(/^\r?\n/, ""));
    if (stop === finish) break;
    i = next;
  }
  for (const p of parts) {
    const split = splitHeadersAndBody(p);
    const partHeaders = parseHeaders(split.headers);
    const ct = (partHeaders.find((h) => h.name.toLowerCase() === "content-type")?.value ?? "text/plain").toLowerCase();
    const cd = partHeaders.find((h) => h.name.toLowerCase() === "content-disposition")?.value ?? "";
    if (cd.toLowerCase().startsWith("attachment")) {
      const filename = cd.match(/filename="?([^";]+)"?/i)?.[1];
      const enc = partHeaders.find((h) => h.name.toLowerCase() === "content-transfer-encoding")?.value?.toLowerCase();
      const decoded = decodeBody(split.body, enc);
      out.attachments.push({
        filename,
        mimeType: ct.split(";")[0],
        size: decoded.length,
        body: decoded,
      });
    } else if (ct.startsWith("text/html") && !out.htmlBody) {
      out.htmlBody = split.body;
      if (!out.textBody) out.textBody = stripHtml(split.body);
    } else if (ct.startsWith("text/plain") && !out.textBody) {
      out.textBody = split.body;
    }
  }
}

function decodeBody(body: string, enc?: string): Uint8Array {
  if (enc === "base64") {
    return Uint8Array.from(Buffer.from(body.replace(/\s+/g, ""), "base64"));
  }
  if (enc === "quoted-printable") {
    return new TextEncoder().encode(decodeQuotedPrintable(body));
  }
  return new TextEncoder().encode(body);
}

function decodeQuotedPrintable(s: string): string {
  return s
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function stripHtml(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, " ").trim();
}
