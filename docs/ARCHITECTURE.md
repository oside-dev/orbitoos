# OrbitOS Architecture

## Layers
1. Control: Command Center, Ideas, Research, Content Studio, Calendar, Analytics, Agents, Brand, Settings.
2. Intelligence: Orchestrator, Research, Strategy, Writing, Creative, Review, Publishing, Analytics, Learning.
3. Execution: AI, research, database, social-platform, and analytics adapters.

## Dependency rule
Intelligence components depend on interfaces, not vendor SDKs. This lets a free/local implementation be replaced without rewriting the product.

## Safety rule
External publishing stays disabled until credentials exist, the adapter is verified, human approval is recorded, and the action is logged.

## Target data model
workspaces, brands, ideas, research_items, content_items, content_variants, schedules, analytics_snapshots, agent_runs, learning_insights.