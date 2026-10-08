# OrbitOS Architecture

## Layers

1. Control: Command Center, Ideas, Research, Content Studio, Calendar, Analytics, Agents, Brand, Settings.
2. Intelligence: Orchestrator, Research, Strategy, Writing, Creative, Review, Publishing, Analytics, Learning.
3. Core: domain models, pipeline rules, runtime services, audit trail.
4. Execution: persistence, research, content, analytics, AI, and publishing adapters.
5. Runtime UI: browser compatibility layer that maps v4 UI state to canonical core state.

## Dependency rule

Intelligence components depend on contracts, not vendor SDKs.

The browser UI may depend on the browser runtime bridge, but the domain and core layers must never import browser APIs, Vercel SDKs, Supabase SDKs, social SDKs, or AI vendor SDKs.

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

## Safety rule

External publishing stays disabled until:

1. an official platform adapter exists,
2. credentials are available through a secure runtime,
3. idempotency/rate limiting controls exist,
4. human approval is recorded,
5. the action is audit logged.

## Target backend data model

workspaces, brands, ideas, research_items, content_items, content_variants, schedules, analytics_snapshots, agent_runs, learning_insights.

The current local state is deliberately shaped to make this backend mapping straightforward.
