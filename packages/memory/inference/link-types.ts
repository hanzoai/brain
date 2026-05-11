/**
 * Typed-link classification.
 *
 * Knowledge-graph edges carry a semantic type. We expose two paths:
 *
 *   - Rule-based: a small dictionary that maps phrases / structural cues
 *     to one of the canonical types. Zero-LLM, fast, deterministic.
 *     (Same edge taxonomy as graph-links / brain has shipped.)
 *
 *   - LLM-based: pass the source + target snippet to a generator and
 *     parse a single-token classification. Plugs into any backend that
 *     supports structured output.
 */
import type { InferenceBackend } from "./index.js";

export const LINK_TYPES = [
  "mentions",
  "founded",
  "invested_in",
  "advises",
  "works_at",
  "attended",
  "authored",
  "cites",
  "succeeded_by",
  "located_in",
  "related",
] as const;

export type LinkType = (typeof LINK_TYPES)[number];

const RULE_TABLE: Array<{ re: RegExp; type: LinkType }> = [
  { re: /\bfounded\b/i,            type: "founded" },
  { re: /\binvested\s+in\b/i,      type: "invested_in" },
  { re: /\badvis(?:or|es|ing)\b/i, type: "advises" },
  { re: /\bworks?\s+(?:at|for)\b/i,type: "works_at" },
  { re: /\battended\b/i,           type: "attended" },
  { re: /\bwrote|authored\b/i,     type: "authored" },
  { re: /\bcites?\b/i,             type: "cites" },
  { re: /\bsucceeded\s+by\b/i,     type: "succeeded_by" },
  { re: /\blocated\s+in\b/i,       type: "located_in" },
];

export function classifyLinkRule(evidence: string): LinkType {
  for (const r of RULE_TABLE) if (r.re.test(evidence)) return r.type;
  return "mentions";
}

export interface LlmClassifyOpts {
  backend: InferenceBackend;
  model: string;
}

export async function classifyLinkLlm(
  evidence: string,
  source: string,
  target: string,
  opts: LlmClassifyOpts,
): Promise<LinkType> {
  const prompt =
    `Classify the relationship between source and target. ` +
    `Allowed labels: ${LINK_TYPES.join(", ")}. ` +
    `Respond with a single label.\n\n` +
    `Source: ${source}\nTarget: ${target}\nEvidence: ${evidence}\n\nLabel:`;
  const res = await opts.backend.generate({
    model: opts.model,
    messages: [{ role: "user", content: prompt }],
    maxTokens: 8,
    temperature: 0,
  });
  const raw = res.content.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z_]/g, "");
  if (!raw) return "mentions";
  return (LINK_TYPES as readonly string[]).includes(raw) ? (raw as LinkType) : "mentions";
}
