/** RFC 2822 email adapter. */
import { parseEmail } from "../email.js";
import type { ExtractionAdapter } from "./index.js";

export const emailAdapter: ExtractionAdapter = {
  strategy: "email",
  async extract({ bytes, filename }) {
    const parsed = parseEmail(bytes);
    const headerLines = [
      parsed.from ? `From: ${parsed.from}` : null,
      parsed.to.length ? `To: ${parsed.to.join(", ")}` : null,
      parsed.subject ? `Subject: ${parsed.subject}` : null,
      parsed.date ? `Date: ${parsed.date}` : null,
    ].filter(Boolean) as string[];
    const text = `${headerLines.join("\n")}\n\n${parsed.textBody}`;
    return {
      text,
      metadata: {
        from: parsed.from,
        to: parsed.to,
        cc: parsed.cc,
        bcc: parsed.bcc,
        subject: parsed.subject,
        date: parsed.date,
        messageId: parsed.messageId,
      },
      derived: parsed.attachments.map((a, i) => ({
        filename: a.filename ?? `${filename}-attachment-${i}`,
        mimeType: a.mimeType,
        bytes: a.body,
        role: "email-attachment",
      })),
    };
  },
};
