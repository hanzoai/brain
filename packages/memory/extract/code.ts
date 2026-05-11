/** Code adapter — splits into syntactic chunks via the brain's chunker. */
import { chunkCode, detectCodeLanguage } from "../code-ast.js";
import type { ExtractionAdapter } from "./index.js";

export const codeAdapter: ExtractionAdapter = {
  strategy: "code",
  async extract({ bytes, filename }) {
    const source = new TextDecoder("utf-8").decode(bytes);
    const chunks = chunkCode(source, filename);
    const language = detectCodeLanguage(filename) ?? "plain";
    return {
      text: source,
      metadata: { language, chunks: chunks.map((c) => ({ symbol: c.symbol, lines: [c.startLine, c.endLine] })) },
    };
  },
};
