/**
 * @hanzo/bot-persona — the agent's PERSONA, attached to the brain.
 *
 * A persona is WHO an agent is: its name, its OCEAN traits, its technical
 * preferences, the way it talks. `@hanzo/persona` owns that shape — the JSON
 * Schema and the PERSONA.md frontmatter convention — and this package does not
 * restate it. It loads the profile, checks it against THAT schema, and files it
 * in the brain store.
 *
 * Filing it in the store is the whole point. brain.db is read by every Hanzo
 * runtime — TS, Python, Rust, Go — so a persona written once is the same
 * persona in all of them. The alternative is each runtime loading its own copy
 * of a file and drifting, which is the duplication the brain exists to end.
 *
 * It stores the profile TWICE, deliberately, because they answer different
 * questions:
 *   • as a PAGE     — the document, for search and for a human to read.
 *   • as FACTS      — one row per trait, so `recall("persona/<id>")` answers
 *                     "who am I" without parsing markdown.
 *
 * Soft contracts throughout, like every other brain pack: if the host does not
 * expose a hook, this plugin is inert for that surface rather than throwing.
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface PersonaConfig {
  /** Where the profile lives. Default: ~/.hanzo/workspace/PERSONA.md */
  path?: string;
  /** Page slug. Default: `persona/<id from the profile>`. */
  slug?: string;
  /** Check the profile against @hanzo/persona's schema. Default: true. */
  validate?: boolean;
}

export interface PersonaApi {
  /** The loaded profile, or null when there is no PERSONA.md. */
  profile: Record<string, unknown> | null;
  /** Re-read and re-file it. Returns the new profile, or null. */
  reload(): Promise<Record<string, unknown> | null>;
}

const DEFAULT_PATH = join(homedir(), ".hanzo", "workspace", "PERSONA.md");

/**
 * split separates YAML frontmatter from the body. A PERSONA.md is markdown
 * with a `---` block on top; anything else is a body with no frontmatter,
 * which is not an error — it is a persona written as prose.
 */
export function split(raw: string): { front: string; body: string } {
  if (!raw.startsWith("---")) return { front: "", body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end === -1) return { front: "", body: raw };
  return { front: raw.slice(4, end), body: raw.slice(end + 4).replace(/^\n/, "") };
}

/**
 * check reports the REQUIRED fields the schema names that the profile does not
 * carry. It is a presence check, not a full JSON Schema validation: the schema
 * is the contract and a validator is a dependency this pack does not need to
 * take, since a missing name is the failure people actually hit.
 */
export function check(profile: Record<string, unknown>, schema: any): string[] {
  const required: string[] = Array.isArray(schema?.required) ? schema.required : [];
  return required.filter((k) => profile[k] === undefined);
}

/**
 * facts projects a profile into recallable rows. Nested objects become dotted
 * predicates (`ocean.openness`), so a runtime asks for one trait without
 * knowing the document's shape. Arrays are joined rather than exploded: a
 * persona's `tags` is one answer, not five.
 */
export function facts(
  profile: Record<string, unknown>,
  subject: string,
  source: string,
): Array<{ subject: string; predicate: string; object: string; source: string }> {
  const out: Array<{ subject: string; predicate: string; object: string; source: string }> = [];
  const walk = (value: unknown, path: string) => {
    if (value === null || value === undefined) return;
    if (Array.isArray(value)) {
      out.push({ subject, predicate: path, object: value.map(String).join(", "), source });
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, path ? `${path}.${k}` : k);
      }
      return;
    }
    out.push({ subject, predicate: path, object: String(value), source });
  };
  walk(profile, "");
  return out;
}

export default async function register(api: any, cfg: PersonaConfig = {}): Promise<PersonaApi> {
  const path = cfg.path ?? DEFAULT_PATH;

  const load = async (): Promise<Record<string, unknown> | null> => {
    let raw: string;
    try {
      raw = readFileSync(path, "utf-8");
    } catch {
      return null; // no PERSONA.md is the ordinary case, not a failure
    }

    const { front, body } = split(raw);
    let profile: Record<string, unknown> = {};
    if (front.trim()) {
      const { parse } = await import("yaml");
      profile = (parse(front) as Record<string, unknown>) ?? {};
    }

    if (cfg.validate !== false) {
      try {
        const { getProfileSchema } = await import("@hanzo/persona");
        const missing = check(profile, getProfileSchema());
        if (missing.length) {
          // Named, not thrown: a half-written persona should still load, and the
          // operator should be told which field the schema wanted.
          api?.log?.warn?.(`persona ${path}: missing ${missing.join(", ")}`);
        }
      } catch {
        // @hanzo/persona absent — the profile still files, unvalidated.
      }
    }

    const slug = cfg.slug ?? `persona/${String(profile.id ?? profile.name ?? "self")}`;
    const store = api?.memory?.store ?? api?.store;
    if (store?.upsertPage) {
      await store.upsertPage(slug, body, profile);
    }
    if (store?.upsertFact) {
      for (const f of facts(profile, slug, path)) {
        await store.upsertFact({ ...f, confidence: 1 });
      }
    }
    return profile;
  };

  const state: PersonaApi = { profile: await load(), reload: async () => (state.profile = await load()) };

  if (typeof api?.tools?.register === "function") {
    api.tools.register({
      name: "brain.persona",
      description: "Read the agent's persona — who it is, how it works, how it talks.",
      input: {},
      handler: () => state.profile,
    });
  }

  return state;
}
