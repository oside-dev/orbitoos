# OrbitOS Architecture

## Layers

1. Control: Command Center, Ideas, Research, Content Studio, Calendar, Analytics, Agents, Brand, Settings.
2. Intelligence: Orchestrator, Research, Strategy, Writing, Creative, Review, Publishing, Analytics, Learning.
3. Core: domain models, pipeline rules, runtime services, schedule state, audit trail.
4. Execution: persistence, research, content, analytics, AI, and publishing adapters.
5. Runtime UI: browser compatibility layer that maps v4 UI state to canonical core state.

## Dependency rule

Intelligence components depend on contracts, not vendor SDKs.

The browser UI may depend on the browser runtime bridge, but the domain and core layers must never import browser APIs, Vercel SDKs, Supabase SDKs, social SDKs, or AI vendor SDKs. AI providers are selected through a provider-neutral content-generator factory.

## State boundary

The UI keeps its current v4 presentation shape for compatibility:

- Title-case pipeline stages
- aggregate analytics rows
- UI event log
- local settings

The canonical core state uses:

- lower-case pipeline stages
- ideas
- research
- content_items
- content_variants
- schedules
- analytics metrics
- agent_runs
- learning insights

src/runtime/ui-state.mjs owns the translation between these shapes.

## Content lifecycle

1. Idea enters the pipeline.
2. Research and Strategy produce structured planning data.
3. Writing generates platform variants.
4. Creative adds platform-native visual direction.
5. Review checks guardrails.
6. Human approval marks variants approved.
7. Schedule records are created per platform and per time.
8. Publishing consumes an existing approved schedule only when an official adapter is enabled and passes the Publishing Gateway. The gateway requires official capability, ready credentials, idempotency support, and rate-limit readiness before it calls an adapter.
9. Analytics normalizes results.
10. Learning produces advisory insights.

Scheduling is a planning/execution boundary, not proof of external publication. The default AI path is deterministic and local; Ollama is an explicit localhost-only adapter choice.

## Safety rule

External publishing stays disabled until:

1. an official platform adapter exists,
2. credentials are available through a secure runtime,
3. idempotency/rate limiting controls exist,
4. human approval is recorded,
5. an approved schedule exists,
6. the action is audit logged.

## Target backend data model

workspaces, brands, ideas, research_items, content_items, content_variants, schedules, analytics_snapshots, agent_runs, learning_insights.

The current local state is deliberately shaped to make this backend mapping straightforward. The persistent backend adapter accepts a Supabase-compatible client without importing a vendor SDK, so it can be tested without a live backend project.
