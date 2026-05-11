/**
 * Capability flags + task-based model selection.
 *
 * Different brain operations have different requirements. The selector
 * picks the best provider+model for a given task from registered
 * profiles.
 */
import { parseSlug } from "./slug.js";

export type Capability =
  | "embedding"
  | "generation"
  | "vision"
  | "transcription"
  | "diarization"
  | "structured"
  | "thinking"
  | "fast"
  | "long-context";

export type Task =
  | "title-generation"
  | "content-revision"
  | "summarization"
  | "embedding"
  | "link-typing"
  | "chat"
  | "structured-extract"
  | "vision-description"
  | "transcription"
  | "diarization";

export interface ModelProfile {
  slug: string; // provider-qualified
  capabilities: Set<Capability>;
  /** Higher = stronger for general tasks. */
  generalScore?: number;
  /** Tokens per second — informational. */
  tps?: number;
  /** Max context tokens. */
  contextTokens?: number;
}

const PROFILES = new Map<string, ModelProfile>();

export function registerProfile(p: ModelProfile): void {
  PROFILES.set(p.slug, p);
}

export function getProfile(slug: string): ModelProfile | undefined {
  return PROFILES.get(slug);
}

// ── Bootstrap profiles for common models ──────────────────────────────

registerProfile({
  slug: "ollama:qwen3.5:9b",
  capabilities: new Set(["generation", "vision", "thinking", "structured"]),
  generalScore: 8,
  contextTokens: 32_768,
});
registerProfile({
  slug: "ollama:qwen3.5:7b",
  capabilities: new Set(["generation", "fast", "structured"]),
  generalScore: 7,
  contextTokens: 32_768,
});
registerProfile({
  slug: "ollama:qwen3.5:27b",
  capabilities: new Set(["generation", "vision", "thinking", "structured", "long-context"]),
  generalScore: 9,
  contextTokens: 65_536,
});
registerProfile({
  slug: "ollama:nomic-embed-text",
  capabilities: new Set(["embedding"]),
});
registerProfile({
  slug: "openai:gpt-4o",
  capabilities: new Set(["generation", "vision", "structured", "long-context"]),
  generalScore: 9,
  contextTokens: 128_000,
});
registerProfile({
  slug: "openai:text-embedding-3-small",
  capabilities: new Set(["embedding"]),
});
registerProfile({
  slug: "openai:text-embedding-3-large",
  capabilities: new Set(["embedding"]),
});

// ── Task → required capability set ────────────────────────────────────

const TASK_REQUIREMENTS: Record<Task, Capability[]> = {
  "title-generation":   ["generation", "fast"],
  "content-revision":   ["generation"],
  "summarization":      ["generation"],
  "embedding":          ["embedding"],
  "link-typing":        ["generation", "structured"],
  "chat":               ["generation"],
  "structured-extract": ["generation", "structured"],
  "vision-description": ["vision"],
  "transcription":      ["transcription"],
  "diarization":        ["diarization"],
};

export interface SelectOpts {
  /** Prefer cheap / fast models even at quality cost. */
  preferFast?: boolean;
  /** Force this provider (e.g. when offline). */
  pinProvider?: string;
}

/** Pick the best registered profile for a task. */
export function selectModel(task: Task, opts: SelectOpts = {}): ModelProfile | undefined {
  const need = TASK_REQUIREMENTS[task];
  let best: ModelProfile | undefined;
  let bestScore = -Infinity;
  for (const p of PROFILES.values()) {
    if (opts.pinProvider && parseSlug(p.slug).provider !== opts.pinProvider) continue;
    if (!need.every((c) => p.capabilities.has(c))) continue;
    let score = p.generalScore ?? 5;
    if (opts.preferFast && p.capabilities.has("fast")) score += 3;
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best;
}
