/**
 * Provider-qualified model slug parsing.
 *
 *   "qwen3:8b"                                       → default provider (Ollama)
 *   "ollama:qwen3:8b"                                → explicit Ollama
 *   "openai:gpt-4o"                                  → OpenAI
 *   "openrouter:anthropic/claude-sonnet-4-20250514"  → OpenRouter
 *   "llamacpp:my-model"                              → llama.cpp
 *
 * Resolves the provider via a known-provider list — anything not in the
 * list is treated as part of the model id and the default provider is
 * used.
 */

export const KNOWN_PROVIDERS = new Set([
  "ollama",
  "openai",
  "openrouter",
  "llamacpp",
  "anthropic",
  "google",
  "azure",
  "groq",
  "together",
  "mock",
]);

export interface ParsedSlug {
  provider: string;
  model: string;
}

export function parseSlug(slug: string, defaultProvider: string = "ollama"): ParsedSlug {
  const colon = slug.indexOf(":");
  if (colon === -1) return { provider: defaultProvider, model: slug };
  const head = slug.slice(0, colon);
  if (KNOWN_PROVIDERS.has(head)) {
    return { provider: head, model: slug.slice(colon + 1) };
  }
  return { provider: defaultProvider, model: slug };
}

export function formatSlug(p: ParsedSlug): string {
  return `${p.provider}:${p.model}`;
}
