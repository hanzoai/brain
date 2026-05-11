/**
 * Document type registry + content-aware auto-detect.
 *
 * Fortémi ships 131 types; here we ship the canonical Hanzo curated set
 * with a registry so consumers add their own. Each type carries a
 * chunking strategy and a revision/template hint.
 */

export type Chunking = "syntactic" | "semantic" | "paragraph" | "fixed";

export interface DocType {
  /** Canonical slug, e.g. "meeting/notes", "research/paper". */
  slug: string;
  /** Human label. */
  label: string;
  /** Default chunking strategy. */
  chunking: Chunking;
  /** Optional filename regex set. */
  filenamePatterns?: RegExp[];
  /** Optional MIME types. */
  mimeTypes?: string[];
  /** Optional content sniffer (returns true if the body matches). */
  contentMatch?: (body: string) => boolean;
  /** Hints for the AI revision step (sections to emphasize). */
  revisionHints?: string[];
}

const REGISTRY = new Map<string, DocType>();

export function registerDocType(t: DocType): void {
  REGISTRY.set(t.slug, t);
}

export function getDocType(slug: string): DocType | undefined {
  return REGISTRY.get(slug);
}

export function listDocTypes(): DocType[] {
  return Array.from(REGISTRY.values());
}

// ── Curated defaults ──────────────────────────────────────────────────

const defaults: DocType[] = [
  {
    slug: "note/plain",
    label: "Plain note",
    chunking: "paragraph",
    revisionHints: ["Clarity", "Concision"],
  },
  {
    slug: "meeting/notes",
    label: "Meeting notes",
    chunking: "semantic",
    filenamePatterns: [/meeting/i, /standup/i, /retro/i, /sync/i],
    contentMatch: (b) => /\b(action item|decision|attendees)\b/i.test(b),
    revisionHints: ["Decisions", "Action Items", "Attendees", "Next Steps"],
  },
  {
    slug: "research/paper",
    label: "Research paper / notes",
    chunking: "semantic",
    filenamePatterns: [/paper/i, /research/i, /\.pdf$/i],
    revisionHints: ["Methodology", "Findings", "Citations"],
  },
  {
    slug: "code/source",
    label: "Source code",
    chunking: "syntactic",
    filenamePatterns: [
      /\.(rs|go|ts|tsx|js|jsx|py|java|c|cc|cpp|h|hpp|rb|kt|swift|sql|sh|bash)$/i,
    ],
    mimeTypes: ["text/x-rust", "text/x-go", "application/typescript", "application/javascript", "text/x-python"],
    revisionHints: ["Purpose", "Inputs", "Outputs", "Edge cases"],
  },
  {
    slug: "code/markdown",
    label: "Markdown / docs",
    chunking: "semantic",
    filenamePatterns: [/\.md$/i, /readme/i],
    mimeTypes: ["text/markdown"],
    revisionHints: ["Audience", "Examples"],
  },
  {
    slug: "email/message",
    label: "Email message",
    chunking: "paragraph",
    filenamePatterns: [/\.eml$/i, /\.msg$/i],
    mimeTypes: ["message/rfc822"],
    revisionHints: ["From/To", "Subject", "Action requested"],
  },
  {
    slug: "spreadsheet/table",
    label: "Spreadsheet",
    chunking: "fixed",
    filenamePatterns: [/\.(xlsx|xls|ods|csv|tsv)$/i],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
      "application/vnd.oasis.opendocument.spreadsheet",
      "text/csv",
      "text/tab-separated-values",
    ],
    revisionHints: ["Schema", "Key rows", "Aggregates"],
  },
  {
    slug: "media/audio",
    label: "Audio recording",
    chunking: "fixed",
    filenamePatterns: [/\.(mp3|wav|flac|m4a|opus|ogg)$/i],
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/flac"],
    revisionHints: ["Topics", "Speakers", "Decisions"],
  },
  {
    slug: "media/video",
    label: "Video recording",
    chunking: "fixed",
    filenamePatterns: [/\.(mp4|mkv|webm|mov)$/i],
    mimeTypes: ["video/mp4", "video/x-matroska", "video/webm"],
    revisionHints: ["Topics", "Speakers", "Scenes"],
  },
  {
    slug: "media/image",
    label: "Image",
    chunking: "fixed",
    filenamePatterns: [/\.(png|jpe?g|webp|gif|tiff?)$/i],
    mimeTypes: ["image/png", "image/jpeg", "image/webp", "image/gif", "image/tiff"],
    revisionHints: ["Subject", "Context", "Source"],
  },
  {
    slug: "media/3d",
    label: "3D model",
    chunking: "fixed",
    filenamePatterns: [/\.(glb|gltf|obj|fbx|stl|usdz)$/i],
    revisionHints: ["Description", "Use"],
  },
  {
    slug: "archive/zip",
    label: "Archive",
    chunking: "fixed",
    filenamePatterns: [/\.(zip|tar|tar\.gz|tgz|7z)$/i],
    mimeTypes: ["application/zip", "application/x-tar", "application/gzip"],
    revisionHints: ["Manifest", "Notable contents"],
  },
];

for (const t of defaults) registerDocType(t);

// ── Auto-detect ────────────────────────────────────────────────────────

export interface DetectInput {
  filename?: string;
  mimeType?: string;
  body?: string;
}

/** Pick the best-matching doc type. Falls back to `note/plain`. */
export function detectDocType(input: DetectInput): DocType {
  const candidates: Array<{ t: DocType; score: number }> = [];
  for (const t of REGISTRY.values()) {
    let score = 0;
    if (input.filename && t.filenamePatterns) {
      for (const re of t.filenamePatterns) if (re.test(input.filename)) score += 2;
    }
    if (input.mimeType && t.mimeTypes) {
      if (t.mimeTypes.includes(input.mimeType)) score += 3;
    }
    if (input.body && t.contentMatch && t.contentMatch(input.body)) score += 1;
    if (score > 0) candidates.push({ t, score });
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.t ?? REGISTRY.get("note/plain")!;
}
