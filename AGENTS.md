# AGENTS.md

## Project

`opencode-planner` is an OpenCode plugin that adds a dedicated `plan` agent for read-only investigation and execution planning before implementation.

The plugin's core behavior is in `index.js`:
- registers the `plan` agent
- injects planner-mode reminders into chat/system messages
- allows `submit_plan` when available
- only exposes `plan_exit` instructions and permission when experimental plan mode is active in the CLI runtime

## Tech Stack

- JavaScript on Node.js
- ES modules (`"type": "module"`)
- npm package, no build step
- tests with `node:test` and `node:assert/strict`

## Repository Layout

- `index.js`: plugin entrypoint and plan-agent configuration
- `test/plugin.test.js`: unit tests for config, permission gating, and reminder injection
- `scripts/debug-plan-runtime.js`: inspects the current OpenCode runtime and plan-agent tool registration
- `scripts/run-opencode-sandbox.js`: launches OpenCode with an isolated temporary config, optionally excluding Plannotator
- `README.md`: install, usage, development, and release notes
- `CHANGELOG.md`: release history

## Working Conventions

- Match the existing style: ESM imports, double quotes, and no semicolons.
- Prefer small, minimal changes over introducing new abstractions.
- Keep prompt and permission text deliberate; tests assert against parts of the generated wording.
- Avoid adding dependencies unless there is a clear need.
- If plugin behavior changes in a user-visible way, update `README.md`. For release-facing behavior changes, update `CHANGELOG.md` too.

## Validation

Run these after relevant changes:

- `npm test`
- `npm run debug:plan`
- `npm run opencode:no-plannotator`
- `npm run opencode:no-plannotator -- debug config`
- `npm run opencode:no-plannotator -- debug agent plan`

Use `npm test` for normal code changes. Use the runtime debug and sandbox commands when changing planner permissions, runtime gating, plugin loading, or tool-registration behavior.

## Notes For Agents

- This repo currently has no dedicated lint or format script; preserve the existing style manually.
- The package is published from version tags, and the README documents the prerelease `@beta` install path.
- Changes around `plan_exit` should preserve the current runtime contract: only mention or allow it when experimental plan mode is enabled and the client is `cli`.
