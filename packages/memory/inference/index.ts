/**
 * Inference provider abstraction.
 *
 * One canonical trait. Pluggable backends (Ollama, OpenAI, OpenRouter,
 * llama.cpp, custom) implement it. Brain modules talk to this trait, not
 * a specific provider.
 */

export interface GenerateRequest {
  model: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  maxTokens?: number;
  /** Optional JSON schema for structured output. */
  jsonSchema?: unknown;
  /** Stop sequences. */
  stop?: string[];
  /** Stream callback (one token at a time). */
  onToken?: (chunk: string) => void;
}

export interface GenerateResponse {
  content: string;
  /** Provider's raw model identifier. */
  model: string;
  /** Approximate token counts. */
  promptTokens?: number;
  completionTokens?: number;
  /** Hidden reasoning trace (qwen-thinking, deepseek-r1, etc.). */
  thinking?: string;
}

export interface EmbedRequest {
  model: string;
  inputs: string[];
  task?: "query" | "passage" | "symmetric";
}

export interface EmbedResponse {
  vectors: number[][];
  model: string;
}

export interface InferenceBackend {
  name(): string;
  generate(req: GenerateRequest): Promise<GenerateResponse>;
  embed(req: EmbedRequest): Promise<EmbedResponse>;
  /** Cheap liveness probe — returns true if the backend is reachable. */
  ping(): Promise<boolean>;
}

const BACKENDS = new Map<string, InferenceBackend>();

export function registerBackend(name: string, b: InferenceBackend): void {
  BACKENDS.set(name, b);
}

export function getBackend(name: string): InferenceBackend | undefined {
  return BACKENDS.get(name);
}

export function listBackends(): string[] {
  return Array.from(BACKENDS.keys());
}

export * from "./slug.js";
export * from "./capabilities.js";
export * from "./runtime-config.js";
export * from "./mock.js";
export * from "./refinement.js";
export * from "./few-shot.js";
export * from "./link-types.js";
export * from "./vision.js";
export * from "./transcription.js";
export * from "./diarization.js";
export * from "./gliner.js";
