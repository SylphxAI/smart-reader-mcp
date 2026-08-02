# Composition doctrine — SDK, not MCP, not CLI for product-to-product

## Principle

- **SDK** = the integration surface for code-to-code (products composing with each other).
- **MCP** = the agent surface (any LLM runtime can discover + call tools via JSON-RPC).
- **CLI** = the human/script surface.

Products must never "call each other through MCP" as the normal path. When Prism
needs Cue structure + Iris semantics, it imports their **SDKs** (`@sylphx/cue/sdk`,
`@sylphx/iris/sdk`) and composes envelopes in code — typed, testable, dogfoodable.

## Why not MCP-to-MCP?

Two MCP servers are separate processes; one server has no built-in way to call
another server's tools. Doing it via spawn/npx is heavy and fragile. SDK-to-SDK
composition keeps each product independent and zero-config.

## Guideline per surface

| Need | Use |
| --- | --- |
| Agent wants a tool it can call | expose **MCP tool** (few, clear) |
| App/library composes several Sylphx products | import **SDK** and call functions |
| Human / script / CI | **CLI** |
| Prism routing to Citra/Iris/Cue | **SDK import** (this is composition, not a new agent tool) |

## Where the line is

- `Prism.composeVideo()` = SDK composition of Cue + Iris (same repo, optional deps).
- The MCP tool set stays minimal (`read_media`, `sniff_format`, `resolve_media_path`)
  — no new agent-visible tool for composition.
- CLI `bun run compose:video` wraps the SDK for humans.

## Rationale (docs honest)

- Less dependency: optional deps only; missing SDKs → clear error, no forced install.
- Few tools / no agent schema growth.
- Dogfooding: our own CLI + docs use the SDK, proving the contract offline.
