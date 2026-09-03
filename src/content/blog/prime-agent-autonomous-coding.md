---
title: 'Configuring Prime Agent 0.9.1 for Long-Running Autonomous Coding'
description: 'How I wired Prime Agent to a local Free Claude Code proxy with 40+ upstream models, xhigh reasoning, and bounded autonomous runs that survive an afternoon of work.'
date: '2026-09-03'
tags: ['prime-agent','autonomous-coding','local-llm','claude-code']
---

# Configuring Prime Agent 0.9.1 for Long-Running Autonomous Coding

Prime Agent is the npm-global CLI from [PrimeIntellect-ai/prime-agent](https://github.com/PrimeIntellect-ai/prime-agent) — a fork of `pi-mono` that runs a persistent Python kernel across turns. That single fact changes what is possible: variables survive compaction, goals outlive a turn, and a real autonomous loop can do hours of work without the model context bleeding out.

I needed a setup that could handle long-running autonomous coding (architecture, refactors, repo-wide audits) without me babysitting the loop. Here is what I landed on, and why each setting exists.

## The shape of the setup

Three files do almost all the work:

- `~/.prime/agent/settings.json` — runtime config (provider, model, compaction, retry)
- `~/.prime/agent/models.json` — custom provider catalog with one provider: my local proxy
- `~/.prime/agent/AGENTS.md` — global operating policy, comment-encoded per the project rules

The provider is `anthropic-proxy`, pointed at a [free-claude-code](https://github.com/sachin7x/free-claude-code) proxy on `127.0.0.1:8082`. The proxy gives me 40+ upstream models behind a single bearer key — Bedrock, Cerebras, DeepSeek, Groq, Cohere, OpenRouter, and more. If one upstream rate-limits, the proxy fails fast with a clear `503 KEY_NAME is not set` and Prime Agent's retry policy decides whether to spin the same turn or surface the error.

## The settings that actually matter

For autonomous work the levers are compaction, retry, and transport. The defaults are too tight.

```json
{
  "defaultProvider": "anthropic-proxy",
  "defaultModel": "anthropic/cerebras/gpt-oss-120b",
  "defaultThinkingLevel": "xhigh",
  "compaction": { "enabled": true, "reserveTokens": 32768, "keepRecentTokens": 40000 },
  "retry": {
    "enabled": true,
    "maxRetries": 5,
    "baseDelayMs": 2000,
    "provider": { "timeoutMs": 1800000, "maxRetries": 3, "maxRetryDelayMs": 120000 }
  },
  "transport": "sse",
  "steeringMode": "one-at-a-time",
  "followUpMode": "one-at-a-time",
  "idleEvictionMinutes": 120
}
```

The big wins:

- **xhigh thinking** on a model that supports a real thinking channel (Cerebras GPT-OSS 120B does). Reasoning visibility is critical for verification, so `hideThinkingBlock` stays false.
- **Compaction keeps the most recent 40k tokens verbatim.** Pair that with a 200k goal budget and the 40k tail is always retained — the working memory of the session.
- **Provider timeout 30 min, retry 3 times.** Deep reasoning on large prompts takes time. Free-tier rate limits need cushion.
- **SSE transport** is required to stream thinking blocks back; without it, the thinking channel is dropped at the wire layer.
- **Sequential steering and follow-up** keep the reasoning chain coherent. Parallel steering is a footgun for autonomous runs — two steering messages racing in the same turn produces nonsense.

## The autonomous flag set (CLI-only, not in settings)

```bash
prime-agent \
  --provider anthropic-proxy \
  --model anthropic/open_router/openrouter/free \
  --thinking high \
  --autonomous-continuations 3 \
  --autonomous-max-turns 12 \
  --autonomous-max-tokens 80000 \
  --autonomous-time-limit-minutes 30 \
  --goal "..." \
  --goal-token-budget 200000
```

Why these numbers:

- **3 continuations, not the default 5** — five is too many; the model wastes time on a stuck subagent instead of admitting defeat and surfacing the gap.
- **12 turns per run** — enough for a focused investigation. Anything deeper should be a goal.
- **80k token cap per turn** — stops one runaway turn from eating the session.
- **30-minute wall clock per turn** — pairs with the 30-minute provider timeout in settings.
- **200k goal budget** — pairs with the 40k tail in compaction so the recent context is always retained.

## The model catalog (41 entries, one provider)

Prime Agent only needs to know about one provider. The proxy translates the gateway ID at request time. The catalog is in `~/.prime/agent/models.json` and the gateway convention is `anthropic/{provider_id}/{model}`. Example rows:

| Gateway ID | Provider | Notes |
|---|---|---|
| `anthropic/cerebras/gpt-oss-120b` | Cerebras | Default — fast, xhigh-capable |
| `anthropic/bedrock/openai.gpt-oss-120b` | AWS Bedrock | Best when you have `AWS_BEARER_TOKEN_BEDROCK` |
| `anthropic/open_router/openrouter/free` | OpenRouter | Free-tier rotation — the rollback path |
| `anthropic/deepseek/deepseek-chat` | DeepSeek | Cheap long-context |
| `anthropic/groq/llama-3.3-70b-versatile` | Groq | Lowest latency |

The full table is in [the github repo](https://github.com/sachin7x/free-claude-code-proxy#models).

## The validation story, honest version

Of the 41 models in the catalog, I can run live round-trips on two right now: Cerebras (when the upstream isn't rate-limiting) and OpenRouter free (always works, just rotates models). The other 39 fail fast with `503 <KEY_NAME> is not set` — expected, because I haven't added keys for them.

What that means: **the configuration is in place and forward-compatible.** The moment I add a key for any of those 39 upstreams, the model activates. No new wiring needed. The proxy's failure messages name the exact env var, so each is a documented action item rather than a mystery.

## What this buys me

A real autonomous run today goes something like: "investigate why the planner subagent keeps re-planning the same graph, then fix the root cause". Prime Agent picks the goal, runs the investigation, surfaces the issue with file paths and line numbers, and the user (me) verifies the fix with the project's check command. The whole thing happens in a single persistent session with the Python kernel holding intermediate state.

That's the win. The Python kernel is durable. The compaction is reliable. The retry policy is honest. The model catalog has a fallback path. Each piece is small; together they let one session do an afternoon of work.

---

If you want the full settings dump, the catalog, and the model-ID convention, see the [free-claude-code-proxy README](https://github.com/sachin7x/free-claude-code-proxy) and the [Prime Agent docs](https://github.com/PrimeIntellect-ai/prime-agent).
