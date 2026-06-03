# @fozikio/tools-cognition

Cognitive tools plugin for [cortex-engine](https://www.npmjs.com/package/@fozikio/cortex-engine) — the epistemic write/read surface for an agent's memory.

## Tools

| Tool | Category | Purpose |
|------|----------|---------|
| `observe` | memory | Record a confirmed fact (auto-dedup via prediction-error gate). |
| `wonder` | memory | Record an open question to revisit later. |
| `speculate` | memory | Record an untested hypothesis. |
| `recall` | memory | List recent observations chronologically. |
| `predict` | memory | Generate a prediction from context to test against reality. |
| `believe` | beliefs | Revise a belief's definition with a reason. |
| `belief` | beliefs | Read a stored belief by concept id. |
| `reflect` | consolidation | Process a memory/signal/observation more deeply. |
| `ruminate` | consolidation | Think through a topic over multiple steps. |
| `dream` | consolidation | Run a consolidation cycle over unconsolidated observations. |
| `digest` | memory | Ingest a document into observations + reflections. |
| `wander` | graph | Walk semantic links from a starting point. |

## Install

```bash
npm install @fozikio/tools-cognition
```

Requires `@fozikio/cortex-engine` as a peer dependency.

## License

MIT
