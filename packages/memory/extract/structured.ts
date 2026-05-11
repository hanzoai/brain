/**
 * Structured-extract adapter — runs an LLM with a JSON schema and pulls
 * out typed fields from free-form content.
 *
 * Pairs naturally with the doc-types registry: each type can ship a
 * default schema (e.g. meeting notes → { decisions, action_items,
 * attendees, next_steps }).
 */
import type { InferenceBackend } from "../inference/index.js";
import type { ExtractionAdapter, ExtractionResult } from "./index.js";

export interface StructuredAdapterOpts {
  backend: InferenceBackend;
  model: string;
  /** JSON schema describing the fields to extract. */
  schema: unknown;
  /** Optional instruction prepended to the prompt. */
  instruction?: string;
}

export function makeStructuredAdapter(opts: StructuredAdapterOpts): ExtractionAdapter {
  return {
    strategy: "structured",
    async extract({ bytes, filename }): Promise<ExtractionResult> {
      const text = new TextDecoder().decode(bytes);
      const prompt =
        (opts.instruction ?? "Extract structured fields. Output only valid JSON matching the schema.") +
        `\n\nDocument: ${filename}\n\nContent:\n${text}\n\nJSON:`;
      const res = await opts.backend.generate({
        model: opts.model,
        messages: [{ role: "user", content: prompt }],
        jsonSchema: opts.schema,
        temperature: 0,
      });
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(res.content);
      } catch {
        parsed = null;
      }
      return {
        text,
        metadata: { structured: parsed },
      };
    },
  };
}
