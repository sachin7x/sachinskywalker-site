---
title: 'The 2-Minute Claude Code Upgrade: Enabling the LSP Tool'
description: 'Every Claude Code user is running without LSP. That means 30-60s grep searches instead of 50ms precise answers. The flag, the marketplace plugins, and the install.'
date: '2026-09-03'
tags: ['claude-code','lsp','devx']
---

# The 2-Minute Claude Code Upgrade: Enabling the LSP Tool

Claude Code has a built-in `LSP` tool that exposes `goToDefinition`, `findReferences`, `hover`, and call-hierarchy operations. Out of the box, every call returns the same message: `"No LSP server available for file type"`. Even when you have `pyright` and `typescript-language-server` installed globally.

This is the [open feature request that motivates the workaround](https://github.com/anthropics/claude-code/issues/15619): Claude Code has the LSP tool but it never connects to installed servers. There is a community-discovered env flag that flips it on. Two minutes of work buys you 100x faster, type-aware code navigation.

## The install, in order

1. **Install the server binaries** (one-line each):
   ```bash
   npm install -g typescript-language-server pyright
   ```

2. **Add the env flag** to `~/.claude/settings.json`:
   ```json
   {
     "env": { "ENABLE_LSP_TOOL": "1" }
   }
   ```

3. **Install the marketplace plugins** (one per language):
   ```bash
   claude plugin install typescript-lsp
   claude plugin install python-lsp
   ```

4. **Confirm `enabledPlugins` was auto-merged** into `~/.claude/settings.json`:
   ```json
   {
     "enabledPlugins": {
       "typescript-lsp@claude-plugins-official": true,
       "python-lsp@claude-plugins-official": true
     }
   }
   ```

5. **Restart Claude Code.** The env flag is read at startup, not on reload.

That's it. The next `goToDefinition` call will hit a real language server instead of bouncing back with the error.

## What you actually get

| LSP operation | Replaces | Why it's better |
|---|---|---|
| `goToDefinition` | grep + `Read` | Skips overloads and import-aliased symbols; lands on the actual definition |
| `findReferences` | grep for the name | Finds *typed* references, not text matches |
| `hover` | doc-comment guessing | Returns the real type signature from the language server |
| `callHierarchy` | manual `Read` of every call site | Tree of in/out edges from a function |
| `documentSymbol` | `Read` first 100 lines | Real outline, not a regex on `def`/`function` |

For Python and TypeScript repos, the typical win is replacing 30-60s of grep-and-Read with a 50ms precise answer.

## Why this matters for long-running coding sessions

When you are running an autonomous agent over a codebase, the time-cost of "where is this defined" and "what calls it" multiplies by the number of subagent invocations. The agent is not smart about when to use grep vs LSP — it just uses what is available. With LSP on, every subagent that needs a definition gets it in 50ms instead of running a 30s grep. Over a 200-turn session, that is the difference between finishing in an hour and finishing in three.

## The catch: it's undocumented

The `ENABLE_LSP_TOOL=1` flag is a community-discovered kill-switch, not an officially committed feature. It is in the binary; it works; Anthropic has not committed to keeping it. If they rename or remove the switch, the LSP tool will silently regress to "no server available" — and the only signal will be the GitHub issue [anthropics/claude-code#15619](https://github.com/anthropics/claude-code/issues/15619) recurring.

Treat this as a known-good workaround, not a stable contract.

## Verifying it works

In a Claude Code session, ask:

> Use the LSP tool to find references to the `compose` function in src/utils/compose.ts.

If LSP is wired correctly, the tool will return a list of typed references. If not, you get `"No LSP server available for file type: .ts"` — in which case the env flag is not being read. Common cause: the env was set in the project `.claude/settings.json` but Claude Code reads the user-global `~/.claude/settings.json` first. Move the `ENABLE_LSP_TOOL` line to the user-global file and restart.

---

See [anthropics/claude-code#15619](https://github.com/anthropics/claude-code/issues/15619) for the original feature request.
