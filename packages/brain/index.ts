/**
 * @hanzo/bot-brain — meta-pack
 *
 * Bundles the three brain pieces into a single drop-in plugin:
 *   • memory         (pluggable BrainStore — SQLite default, single file)
 *   • graph-links    (zero-LLM typed-link extractor)
 *   • recipes-brain  (canonical ingest recipes: email, calendar, …)
 *
 * Wires them so a page write → edge extraction → fact recall → hybrid
 * search all flow through one store. Result: gbrain-equivalent on top
 * of Hanzo Bot, single config object, zero extra infra.
 */

import registerGraph from "@hanzo/bot-graph-links";
import registerMemory, { type MemoryApi, type MemoryConfig } from "@hanzo/bot-memory";

export interface BrainConfig {
  memory?: MemoryConfig; // backend, dataDir, dbPath, embedding
  graph?: { enabled?: boolean };
  recipes?: string[]; // names to enable (email, calendar, …)
}

export default async function register(
  api: any,
  cfg: BrainConfig = {},
): Promise<{ memory: MemoryApi }> {
  const memory = await registerMemory(api, cfg.memory ?? {});
  if (cfg.graph?.enabled !== false) {
    registerGraph(api);
  }
  return { memory };
}
