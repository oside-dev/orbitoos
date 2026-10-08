# OrbitOS Agent Contracts

## Orchestrator

Input: user brief + brand + current pipeline state.  
Output: ordered workflow steps.

Implementation: src/agents/orchestrator.mjs.

## Research

Input: topic + audience.  
Output: signals, source labels, opportunity score.

Implementation: adapter-backed src/agents/research.mjs.

## Strategy

Input: research + brand goals.  
Output: platform plan, content angle, KPI.

Implementation: src/agents/strategy.mjs.

## Writing

Input: strategy + brand voice.  
Output: hook, body/script, CTA, hashtags per platform.

Implementation: adapter-backed src/agents/writing.mjs.

## Creative

Input: generated variants + brand visual direction.  
Output: platform-specific creative brief and visual direction.

Implementation: deterministic local src/agents/creative.mjs.

## Review

Input: draft + brand guardrails.  
Output: pass/fail + reasons.

Implementation: src/agents/review.mjs.

## Publishing

Input: approved variant + schedule.  
Output: provider job result. Disabled until an official adapter is connected.

## Analytics

Input: platform metrics.  
Output: normalized analytics snapshot.

Implementation: adapter-backed src/agents/analytics.mjs.

## Learning

Input: analytics + content history.  
Output: high-confidence recommendations stored as learning insights.

Implementation: local deterministic src/agents/learning.mjs. Recommendations are advisory; strategy changes remain human-reviewed.

All contracts are provider-neutral. The first implementation is local/deterministic.
