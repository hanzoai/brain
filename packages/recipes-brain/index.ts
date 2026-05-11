/**
 * @hanzo/bot-recipes-brain — ingest recipes for the Hanzo Brain
 *
 * Loads YAML recipes from this package's `recipes/` directory and
 * registers them with the bot's scheduler. Each recipe defines:
 *   - auth (OIDC via hanzo.id)
 *   - cron schedule
 *   - ingest fetcher
 *   - classify schema (model + JSON schema)
 *   - draft prompt + context bindings
 *   - enqueue target (drafts.<recipe>)
 *   - on_swipe hooks (send / reject / edit)
 *
 * Brain meta-pack consumes this and the user's enabled-recipe list to
 * boot the daily-life automations.
 */

import { readFile, readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RECIPES_DIR = join(HERE, "recipes");

export interface Recipe {
  recipe: string;
  version: number;
  backend: string;
  auth?: Record<string, unknown>;
  cron?: string;
  ingest?: Record<string, unknown>;
  classify?: Record<string, unknown>;
  draft?: Record<string, unknown>;
  enqueue?: Record<string, unknown>;
  notify?: Record<string, unknown>;
  [key: string]: unknown;
}

export async function loadRecipe(name: string): Promise<Recipe> {
  const path = join(RECIPES_DIR, `${name}.yaml`);
  const raw = await readFile(path, "utf-8");
  // Bot already depends on `yaml` (eemeli/yaml v2). Use it.
  const yaml = await import("yaml" as any);
  return yaml.parse(raw) as Recipe;
}

export async function listRecipes(): Promise<string[]> {
  try {
    const files = await readdir(RECIPES_DIR);
    return files.filter((f) => f.endsWith(".yaml")).map((f) => f.replace(/\.yaml$/, ""));
  } catch {
    return [];
  }
}

export default async function register(
  api: any,
  enabled: string[] = [],
): Promise<{
  recipes: Recipe[];
}> {
  const all = await listRecipes();
  const toLoad = enabled.length ? enabled.filter((n) => all.includes(n)) : all;
  const recipes: Recipe[] = [];
  for (const name of toLoad) {
    const recipe = await loadRecipe(name);
    recipes.push(recipe);
    if (typeof api?.scheduler?.register === "function") {
      api.scheduler.register({
        name: `brain.recipe.${recipe.recipe}`,
        cron: recipe.cron,
        handler: () => runRecipe(api, recipe),
      });
    }
  }
  return { recipes };
}

// Recipe runner — stubbed end-to-end. Real adapters live in each
// backend's own extension (gmail in `bot-gmail`, etc.). This file just
// orchestrates the pipeline: fetch → classify → draft → enqueue.
async function runRecipe(api: any, recipe: Recipe): Promise<void> {
  const fetcher = api?.adapters?.[recipe.backend];
  if (!fetcher) {
    api?.log?.warn?.(`[brain] no adapter for backend=${recipe.backend}, skipping`);
    return;
  }
  const items = await fetcher.fetch(recipe.ingest);
  for (const item of items ?? []) {
    const classification = await api.llm.classify({
      model: (recipe.classify as any)?.model,
      schema: (recipe.classify as any)?.schema,
      input: item,
    });
    if (!classification?.needs_reply) continue;
    const draft = await api.llm.draft({
      model: (recipe.draft as any)?.model,
      prompt: (recipe.draft as any)?.prompt,
      context: await resolveContext((recipe.draft as any)?.context ?? [], item, api),
    });
    await api.queues.enqueue((recipe.enqueue as any)?.queue, {
      item,
      classification,
      draft,
      ttl: (recipe.enqueue as any)?.ttl,
    });
  }
}

async function resolveContext(specs: string[], item: any, api: any): Promise<any[]> {
  const out: any[] = [];
  for (const spec of specs) {
    // Brain calls — e.g. `brain.recall(from_email)`, `brain.search(thread_id)`.
    const m = spec.match(/^(\w+)\.(\w+)\((.*)\)$/);
    if (!m) continue;
    const [, ns, fn, args] = m;
    if (ns !== "brain") continue;
    const argVal = args
      .replace(/\b(\w+)\b/g, (k) => JSON.stringify(item?.[k] ?? k))
      .replace(/^"|"$/g, "");
    if (fn === "recall" && api.tools?.["brain.recall"]) {
      out.push(await api.tools["brain.recall"]({ entity: argVal }));
    } else if (fn === "search" && api.tools?.["brain.search"]) {
      out.push(await api.tools["brain.search"]({ query: argVal }));
    }
  }
  return out;
}
