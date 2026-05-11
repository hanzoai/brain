/**
 * Content summarizer adapter.
 *
 * Cascade: fast-pass model (small) for short content, standard-pass
 * model (larger) for longer. Both implement `InferenceBackend`.
 */
import type { InferenceBackend } from "../inference/index.js";
import type { ExtractionAdapter, ExtractionResult } from "./index.js";
import { estimateTokens, truncateToTokens } from "../tokenizer.js";

export interface SummarizerOpts {
  fastBackend: InferenceBackend;
  fastModel: string;
  standardBackend?: InferenceBackend;
  standardModel?: string;
  /** Threshold (in estimated tokens) above which we use standardModel. */
  cascadeAt?: number;
  /** Max tokens of input to pass through. */
  maxInputTokens?: number;
}

export function makeSummarizerAdapter(opts: SummarizerOpts): ExtractionAdapter {
  return {
    strategy: "summarizer",
    async extract({ bytes, filename }): Promise<ExtractionResult> {
      const raw = new TextDecoder().decode(bytes);
      const input = truncateToTokens(raw, opts.maxInputTokens ?? 8000);
      const cascadeAt = opts.cascadeAt ?? 2000;
      const useStandard = estimateTokens(input) > cascadeAt && opts.standardBackend && opts.standardModel;
      const backend = useStandard ? opts.standardBackend! : opts.fastBackend;
      const model = useStandard ? opts.standardModel! : opts.fastModel;
      const res = await backend.generate({
        model,
        messages: [
          { role: "system", content: "Summarize in 3-6 bullet points, preserving named entities and decisions." },
          { role: "user", content: `# ${filename}\n\n${input}` },
        ],
        temperature: 0.2,
      });
      return {
        text: res.content,
        metadata: { summarizer: useStandard ? "standard" : "fast", model },
      };
    },
  };
}
