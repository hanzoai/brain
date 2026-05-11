# @hanzo/bot-brain

> The Hanzo Brain meta-pack. Drops `memory + graph-links + recipes` into Hanzo Bot. Single binary, single config, SQLite by default.

What gbrain is to OpenClaw, this is to Hanzo Bot — except we _are_ OpenClaw (forked), so the gateway, channels, voice, mobile apps, and 355 atomic skills come along for free.

## Install

The brain meta-pack is shipped with `@hanzo/bot`. Enable in `hanzo.toml`:

```toml
[plugins.brain]
enabled = true

[plugins.brain.memory]
# Optional. Defaults below.
# backend = "sqlite"
# dbPath  = "~/.hanzo/brain/brain.db"

[plugins.brain.graph]
enabled = true        # zero-LLM typed-link extraction on every page write

[plugins.brain.recipes]
# Daily-life automations. See recipes-brain/recipes/.
enabled = ["email"]
```

Then run the bot — solo dev or multi-tenant, same binary:

```bash
hanzo-bot serve
```

Drop markdown into `~/.hanzo/workspace/`. Edges auto-extract. Facts queryable via the `brain.recall` and `brain.search` MCP tools.

## What lives inside

| Sub-extension                                   | What it does                                                                          |
| ----------------------------------------------- | ------------------------------------------------------------------------------------- |
| [`@hanzo/bot-memory`](../memory/)               | Pluggable BrainStore — SQLite default. `pages`, `edges`, `facts`, FTS5.               |
| [`@hanzo/bot-graph-links`](../graph-links/)     | Zero-LLM typed-link extractor. Emits `attended/works_at/invested_in/founded/advises`. |
| [`@hanzo/bot-recipes-brain`](../recipes-brain/) | YAML recipes — email today, calendar/slack/X/notion next.                             |

## Architecture

```
                  Hanzo Bot (OpenClaw fork)
                  │
                  ▼
             @hanzo/bot-brain  (this pack)
                  │
        ┌─────────┼───────────┐
        ▼         ▼           ▼
   memory     graph-links   recipes-brain
   (SQLite)   (regex)       (YAML loader)
        │         │           │
        ▼         ▼           ▼
   ~/.hanzo/brain/brain.db (one file, the brain)
```

## MCP tools exposed

| Tool           | What it does                                                             |
| -------------- | ------------------------------------------------------------------------ |
| `brain.recall` | `{ entity, limit? }` → facts about an entity, newest first               |
| `brain.search` | `{ query, topK? }` → hybrid search (FTS + vector + RRF) across all pages |

These wire into Claude Code / Cursor / Windsurf the moment you `claude mcp add hanzo`.

## Pluggability

The `memory` extension exposes `registerBackend(name, factory)`. Anyone can ship a Postgres / LanceDB / D1 / libSQL backend as a sibling extension — no fork of this pack needed. See [`memory/README.md`](../memory/README.md).

## Compared to gbrain

|                  | gbrain                         | Hanzo Brain                                                 |
| ---------------- | ------------------------------ | ----------------------------------------------------------- |
| Runtime          | OpenClaw mod                   | Hanzo Bot extension (we own the gateway)                    |
| Default store    | PGLite                         | SQLite                                                      |
| Schema           | pages/edges/facts              | same — pages/edges/facts/FTS5                               |
| Graph extraction | regex, zero-LLM                | regex, zero-LLM (same approach)                             |
| Skills           | 34 curated                     | 355 atomic + 88 specialized agents in `~/work/hanzo/skills` |
| Channels         | 0 (BYO gateway)                | 30+ (Slack/Discord/WhatsApp/Telegram/iMessage/…)            |
| Voice            | Twilio + Realtime via OpenClaw | Twilio/Telnyx/Plivo + LiveKit native                        |
| Mobile apps      | none                           | iOS / Android / macOS ship with the bot                     |
| Pricing model    | single-user                    | multi-tenant, shared credits via Hanzo Node                 |
