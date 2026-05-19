# Security Policy

## Reporting a vulnerability

Email security@hanzo.ai with details. Encrypt with our PGP key (fingerprint TBD).

We respond within 48 hours. Critical issues receive same-day acknowledgment.

## Scope

This policy covers code in this repository. For the broader Hanzo platform threat model, see [hanzoai/HIPs](https://github.com/hanzoai/HIPs).

## Sandbox boundary

`brain` stores facts and memory in a single local SQLite file at `~/.hanzo/brain/brain.db` — the file is owned by the user and never leaves the host unless the operator explicitly enables replication via `replicate` or `vfs`. Edge extraction is deterministic (regex + role inference); no LLM call is required to ingest content, so prompt-injection content in user data cannot influence extraction.

For runtime sandbox guarantees, see HIP-0105 (in-process extension runtimes).
