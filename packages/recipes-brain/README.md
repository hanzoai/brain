# @hanzo/bot-recipes-brain

> YAML ingest recipes for the Hanzo Brain. Daily-life automations — email today, calendar / Slack / X / Notion next.

A recipe defines: auth + cron + ingest + classify + draft + enqueue + on_swipe hooks. The bot runs it on a schedule, drops drafts into a queue, the Hanzo app shows the swipe UI. Every swipe is a training signal.

## Flagship: email

```bash
hanzo-bot brain run-recipe email
hanzo-bot brain drafts list
hanzo-bot brain drafts approve <id>    # sends via gmail
hanzo-bot brain drafts reject  <id>    # logs as decline-fact for training
```

See [`recipes/email.yaml`](./recipes/email.yaml) for the spec. Auth is OIDC via hanzo.id (single sign-on across all Hanzo services). Cron defaults to every 30 minutes — adjust per inbox volume.

## How a recipe runs

```
cron fires
  → ingest      fetch new items from backend (gmail, calendar, …)
  → classify    cheap model tags each item (needs_reply, priority, …)
  → draft       main model writes a response using brain context:
                  • brain.recall(from_email)        — facts about sender
                  • brain.search(thread_id)         — prior thread
                  • brain.facts({entity, since:30d}) — recent activity
                  • brain.style(sender:me, recent:200) — your tone
  → enqueue     drop into drafts.email queue (TTL 7d)
  → notify      push to the Hanzo iOS / Android / macOS app
```

## Swipe → train loop

Every swipe in the app feeds back into the brain:

- **swipe right (send)** → send via gmail, upsert fact `{subject:from_email, predicate:"replied"}`, add `(received, sent)` pair to style examples
- **swipe left (reject)** → delete draft, upsert fact `{predicate:"declined_reply"}`, down-weight similar drafts
- **swipe up (snooze 24h)** → reschedule
- **tap edit → send** → upsert fact `{predicate:"replied"}`, add the _edited_ version to style examples (highest-quality training pair)

After ~200 swipes, the draft quality compounds — the brain learns your tone from your own actions, not from a tone-tuning UI.

## Adding a new recipe

Drop a `<name>.yaml` into `recipes/`. The loader walks the directory; the scheduler registers anything with a `cron:` field.

Minimal shape:

```yaml
recipe: notion
version: 1
backend: notion

auth:
  provider: hanzo.id

cron: "0 */2 * * *"

ingest:
  source: workspace-pages
  since: 12h

classify:
  model: zen-2-haiku
  schema: { needs_reply: bool, priority: one_of [P0,P1,P2,P3] }

draft:
  when: needs_reply == true
  model: zen-2
  context:
    - brain.recall(page_id)
    - brain.search(title)

enqueue:
  queue: drafts.notion
  ttl: 7d
```

## API

```ts
import { listRecipes, loadRecipe } from "@hanzo/bot-recipes-brain";

await listRecipes(); // ["email", "notion", …]
const recipe = await loadRecipe("email");
```

## Plugin contract

```ts
import register from "@hanzo/bot-recipes-brain";
const { recipes } = await register(api, ["email", "notion"]);
// → registers each recipe as a cron job in the bot scheduler
```

## YAML driver

Bot already depends on the `yaml` package (eemeli/yaml v2). No new deps.
