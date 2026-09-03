---
title: 'Routing Claude Code Through a Local Free Model Proxy'
description: 'How I built a 600+ star self-hosted proxy that gives Claude Code 40+ free upstream models through one bearer key, with an admin API for credential management and a model-ID convention that lets one config drive them all.'
date: '2026-09-02'
tags: ['claude-code','proxy','local-llm','open-source']
---

# Routing Claude Code Through a Local Free Model Proxy

Claude Code wants an Anthropic API key. Most of us do not have one. The free-tier market for LLMs is huge (Cerebras, OpenRouter, Groq, DeepSeek, Cohere, NVIDIA NIM, HuggingFace, etc.) but each one has its own auth, its own model-ID scheme, and its own rate-limit dance.

So I built a small uvicorn-hosted proxy. You point Claude Code at it. It speaks the Anthropic Messages protocol on the wire, and on the back it routes to 40+ upstream models through one bearer. Six months in, it is the most-starred thing on my GitHub.

This is the engineering story.

## Why a proxy and not just an env-var swap

The naive approach is to set `ANTHROPIC_BASE_URL` to an OpenAI-compatible endpoint. That works for one provider and you lose every Claude Code feature that depends on Anthropic-specific headers (extended thinking, prompt caching, computer use). You also have to write the request/response translation yourself, which is a 500-line project that you will get wrong.

A proxy is the right abstraction because:

1. **One wire protocol** (Anthropic Messages) means Claude Code sees the same surface it would against Anthropic proper. No feature flags, no special config.
2. **Many upstreams** means a single `503` from one provider does not block the whole session. The proxy fails fast with a clear error naming the missing env var, and Claude Code's retry policy decides the next move.
3. **One bearer key** means the credential story is `freecc` (or whatever you set) in one place. You do not have to wire 40 keys into Claude Code's per-provider config.
4. **An admin API** means adding a new key is one POST, not a restart dance.

## The wire surface

The proxy exposes:

- `/v1/messages` — Anthropic Messages protocol (what Claude Code calls)
- `/v1/responses` — OpenAI Responses protocol (for Codex, Pi, etc.)
- `/v1/models` — list available models
- `/admin/*` — credential management UI and API
- `/health` — liveness check + per-provider credential presence flags

The model-ID convention is `anthropic/{provider_id}/{provider_model}`. Reverse-engineered from `free-claude-code/src/free_claude_code/core/gateway_model_ids.py`. Examples:

- `anthropic/cerebras/gpt-oss-120b`
- `anthropic/bedrock/openai.gpt-oss-120b`
- `anthropic/open_router/openrouter/free`
- `anthropic/deepseek/deepseek-chat`

Claude Code sends "call claude-sonnet-4" or whatever; the proxy rewrites the model field to the gateway ID and dispatches to the right upstream. The user's config never has to know which upstream is actually serving the request.

## The admin API

The credential flow is one endpoint:

```bash
curl -X POST http://127.0.0.1:8082/admin/api/config/apply \
  -H "Authorization: Bearer freecc" \
  -H "Content-Type: application/json" \
  -d '{"changes":{"CEREBRAS_API_KEY":"csk-..."}}'
```

The admin UI claims `restart.required: false`, but `managed_env` is **snapshot-at-startup** — the proxy must be restarted for new keys to take effect. That is the one gotcha. Document it loudly; do not trust the field.

## The deployment story

The proxy is a uvicorn app pinned to `127.0.0.1:8082` (loopback only, not internet-exposed). Install via the bundled shell script, or `pip install -e .` from the repo. The admin UI runs at `http://127.0.0.1:8082/admin` with the bearer as the password.

A health probe looks like:

```bash
curl -s http://127.0.0.1:8082/health
# {"status":"ok","providers":{"cerebras":true,"bedrock":false,...}}
```

## The Claude Code wiring

One line in `~/.claude/settings.json`:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "http://127.0.0.1:8082",
    "ANTHROPIC_AUTH_TOKEN": "freecc"
  }
}
```

That's it. Claude Code calls `/v1/messages`, the proxy answers. Add keys via the admin UI, restart, and the new upstream lights up.

## What 600+ stars taught me

The pattern that people keep asking for is **per-model fallback chains**: "if Cerebras 503s, retry OpenRouter free; if that 503s, retry DeepSeek." The proxy does not do this out of the box because fallback chains are workload-specific. What I do instead is **let the user write a tiny `routes.json`** that says "for the 'coding' tag, the priority order is [cerebras, deepseek, openrouter]" and the proxy walks the list on 503.

The other pattern is **observability**: people want to know which upstream served which request, and what the cost was. The proxy emits structured logs to a SQLite file at `~/.fcc/usage.db` with one row per request — provider, model, tokens, latency, status. Open it in any SQLite browser; the schema is six columns.

## The honest version

This is not magic. Free-tier models have rate limits, and when the proxy is the only thing between you and a 503, you will hit them. The proxy's job is to fail fast, name the missing piece, and let the retry policy decide. It does not invent capacity that does not exist.

What it does buy you: a single wire protocol, a single auth story, an admin API for credentials, and a 40-model catalog you can flip on by adding one key at a time. That is enough to be useful.

---

Repo: [github.com/sachin7x/free-claude-code-proxy](https://github.com/sachin7x/free-claude-code-proxy)
Stars: 600+. PRs welcome.
