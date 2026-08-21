/**
 * @hanzo/bot-brain — meta-pack
 *
 * Bundles the four brain pieces into a single drop-in plugin:
 *   • memory         (pluggable BrainStore — SQLite default, single file)
 *   • graph-links    (zero-LLM typed-link extractor)
 *   • recipes-brain  (canonical ingest recipes: email, calendar, …)
 *   • persona        (PERSONA.md → the profile the agent carries)
 *
 * Wires them so a page write → edge extraction → fact recall → hybrid
 * search all flow through one store. Result: gbrain-equivalent on top
 * of Hanzo Bot, single config object, zero extra infra.
 */

import registerGraph from "@hanzo/bot-graph-links";
import registerMemory, { type MemoryApi, type MemoryConfig } from "@hanzo/bot-memory";
import registerPersona, { type PersonaApi, type PersonaConfig } from "@hanzo/bot-persona";

export interface BrainConfig {
  memory?: MemoryConfig; // backend, dataDir, dbPath, embedding
  graph?: { enabled?: boolean };
  recipes?: string[]; // names to enable (email, calendar, …)
  persona?: PersonaConfig | false; // false disables; default reads ~/.hanzo/workspace/PERSONA.md
}

export default async function register(
  api: any,
  cfg: BrainConfig = {},
): Promise<{ memory: MemoryApi; persona: PersonaApi | null }> {
  const memory = await registerMemory(api, cfg.memory ?? {});
  if (cfg.graph?.enabled !== false) {
    registerGraph(api);
  }
  // Persona AFTER memory, because it files the profile INTO the store memory
  // just opened. It reads `api.memory.store` when the host wired one and falls
  // back to the store returned here, so it works either way.
  const persona =
    cfg.persona === false
      ? null
      : await registerPersona({ ...api, memory: { ...(api?.memory ?? {}), store: memory.store } }, cfg.persona ?? {});
  return { memory, persona };
}
