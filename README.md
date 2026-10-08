# OrbitOS

OrbitOS is a zero-budget-first AI social media operating system.

## Goal
Turn one content idea into a measurable workflow:
Idea -> Research -> Strategy -> Draft -> Platform Variants -> Review -> Schedule -> Analytics -> Learning

## Current architecture
- Source of truth: GitHub
- Frontend: dependency-free static web app for the first milestone
- Persistence: browser localStorage in v0.1
- Deployment: Vercel Hobby
- AI: deterministic local simulation in v0.1
- Research: simulated data in v0.1
- Publishing: disabled/simulated
- Human approval: required before future publishing
- Paid API dependency: none

## Zero-budget rule
Do not introduce a dependency that requires payment for the core product to work. Treat free quotas as quotas, not unlimited capacity.

## Product milestones
M0 Foundation -> M1 Content loop -> M2 Free backend -> M3 Free/local AI -> M4 Official platform adapters -> M5 Analytics and learning.