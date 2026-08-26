# opencode-planner

`opencode-planner` is an OpenCode plugin that 
* emulates Experimental Plan Mode
* integrates external review and feedback editing of the plan via your choice of editor, or Plannotator

## Install / upgrade

The current release is `0.6.0`. The same npm package supports OpenCode V1 and OpenCode V2 through a dual-host `./server` export.

Compatibility was verified on August 25, 2026 with OpenCode V1 `1.18.22` and OpenCode V2 `v0.0.0-beta-18155`.

### Support OpenCode V1 and V2 together

Install or upgrade the pinned release globally with OpenCode V1's plugin installer:

```bash
opencode plugin opencode-planner@0.6.0 --global --force
```

This writes the singular V1-compatible field to the global `opencode.json(c)`. You can configure the same entry manually:

```json
{
  "plugin": ["opencode-planner@0.6.0"]
}
```

OpenCode V1 reads `plugin`, resolves `./server`, and calls its legacy `server()` adapter. OpenCode V2 migrates the same entry into its plugin list, resolves `./server`, and calls the native `setup()` method. The package root remains a fallback for older V1 resolution behavior. Do not add the plural `plugins` field to a shared V1/V2 configuration: OpenCode V1 rejects that unknown field instead of ignoring it.

### OpenCode V2 only

If you no longer use OpenCode V1, install the pinned release with OpenCode V2's plugin installer:

```bash
opencode2 plugin add opencode-planner@0.6.0
```

This writes the plural V2 field to the global `opencode.json(c)`. You can configure the same entry manually:

```json
{
  "plugins": ["opencode-planner@0.6.0"]
}
```

### Upgrading

Change the pinned version whenever a new release is published. Do not use `@latest` as an update strategy: OpenCode resolves it when the plugin is first installed, but an already-installed `@latest` entry does not automatically advance to newer releases.

For a shared V1/V2 installation, rerun the V1 installer with the new version and `--force`. For a V2-only installation, remove the previous pinned spec and add the new one:

```bash
opencode2 plugin remove opencode-planner@PREVIOUS_VERSION
opencode2 plugin add opencode-planner@0.6.0
```

Restart OpenCode after installing or upgrading so the plugin is reloaded.

### Local development

Explicit file URLs do not perform npm subpath selection. Point a shared V1/V2 development configuration directly at the dual-host `server.js` entrypoint:

```json
{
  "plugin": ["file:///absolute/path/to/opencode-planner/server.js"]
}
```

For V2-only local development, use the same file with the native plural field:

```json
{
  "plugins": ["file:///absolute/path/to/opencode-planner/server.js"]
}
```

Replace `/absolute/path/to/opencode-planner` with the path to your checkout.

### Retire OpenCode V1 support

When you no longer need OpenCode V1, rename the singular `plugin` field to the plural V2 `plugins` field, preserving the package list:

```json
{
  "plugins": ["opencode-planner@0.6.0"]
}
```

## Overview

It adds a dedicated `plan` agent for read-only planning before implementation.
Its functionality is an emulation of the experimental plan agent (it has no hard dependency on `EXPERIMENTAL_PLAN_MODE=1`, although that setting enables a tool called plan_exit which this plugin will use if available). That is, it likes to use sub-agents and a structured approach to planning, asks clarifying questions, and finally it produces a markdown file.

When Plannotator is installed, it can submit the finished plan for richer review.

Without Plannotator, it can open the plan in your configured external editor for review. A new command `/edit-plan` will open the plan in the editor if needed.

In either case, changes made while editing will trigger a revision of the plan.

You can easily tweak the prompt, in fact /plan_prompt gives you the plugin's prompt as a starting point for customisation.


After review, the agent can hand back to implementation mode by calling `plan_exit` only when the host runtime exposes that tool. In OpenCode V1, that means experimental plan mode must be enabled and the client must be `cli`. OpenCode V2 detects actual tool availability while assembling the model context. If the tool is unavailable, prompt the build agent to start work.

Repository: <https://github.com/timrichardson/opencode-planner>

## Getting started
1. Install plugin, launch opencode
2. tab to Plan agent
3. make a plan
4. when the LLM considers the plan is complete, it will invoke your editor or PlanNotator will be invoked. PlanNotator has priority.
5. add comments to the plan, save and exit the editor (you can also write "approved" although no edits should mean that as well)
6. the Plan agent will react to chagnes you made, then you iterate. Or else, it says it is ready to implement. Exit Plan agent and tell the Build agent to implement.

## Commands added
* `/edit-plan`: open plan in editor as configured (this also happens automatically when opencode calls submit_plan tool)
* `/plan-prompt`: shows the plugin's prompt, as a starting point for customisation
* `/planner-config`: shows how it determines which editor is used because there are three possible env vars.


### Rationale
Experimental plan mode is not a focus for the core devs, who point out that a plugin can do it, which I set out to prove, at least as a concept. This plugin means, at least for me, a development path for a stronger Plan agent independent of core OpenCode priorities.


## What it does

- adds a `plan` agent intended for design and implementation planning
- constrains that agent to read-only tools plus markdown plan editing
- injects a system reminder that keeps the planning workflow explicit
- lets V1 users replace the plugin's base `plan` prompt with `agent.plan.prompt` and V2 users replace it with `agents.plan.system`
- lets users override agent settings such as the selected model and provider-specific request options
- denies planner handoff tools to the built-in V1 `general` and `explore` subagents, while V2 removes planner-only tools from every non-`plan` context so they do not follow the session into implementation mode
- exposes a `planner_config` tool so the `plan` agent can inspect planner-specific runtime and editor configuration
- exposes a `plan_prompt` tool so the `plan` agent can reveal the plugin's prompt basis for customization
- exposes an `edit_plan` tool so the `plan` agent can open the current plan in the configured external editor
- registers an `/edit-plan` command that routes to the `plan` agent and asks it to call `edit_plan`
- registers a `/planner-config` command that routes to the `plan` agent and asks it to call `planner_config`
- uses `submit_plan` for review when available, otherwise falls back to external-editor review
- keeps the agent in planner mode if the plan file changed after `submit_plan`; the revised plan must be resubmitted before `plan_exit`
- can leave planner mode with `plan_exit` after approval when the active OpenCode runtime exposes that tool

## Customize the plan agent

If you use OpenCode V1 and set `agent.plan.prompt`, the plugin replaces its built-in base planning prompt with your text. Other agent settings, such as `agent.plan.model` and provider-specific options like `agent.plan.reasoningEffort`, are merged in normally.

```json
{ 
  "agent": {
    "plan": {
      "model": "openai/gpt-5.4",
      "reasoningEffort": "high",
      "prompt": "You are my planning agent. Focus on migration risk, rollout steps, and testing strategy."
    }
  }
}
```

For OpenCode V2, use the native `agents.plan.system` field:

```json
{
  "agents": {
    "plan": {
      "model": "openai/gpt-5.4",
      "system": "You are my planning agent. Focus on migration risk, rollout steps, and testing strategy."
    }
  }
}
```

The runtime planner reminder still applies, so the agent stays in planner mode and continues to use the review handoff flow. That reminder is injected by the plugin at runtime and is not customized through the V1 `agent.plan.prompt` or V2 `agents.plan.system` field.

## Reveal the plugin prompt basis

The plugin also adds a read-only `plan_prompt` tool. Ask the `plan` agent to use it when you want the plugin's own prompt text and planner reminder as a starting point for customization.

Example:

```text
Use the plan_prompt tool and show me the plugin prompt so I can customize it.
```

The tool returns:

- the plugin base prompt
- the injected planner reminder, which is plugin-controlled runtime guidance and is not customized via `agent.plan.prompt`
- a short note explaining that the final runtime prompt can still differ because of user config, other plugins, or runtime tool availability like `plan_exit`

## Diagnose planner configuration

The plugin also adds a read-only `planner_config` tool. Use it when you want to inspect planner-specific configuration, especially editor selection precedence across `PLAN_VISUAL`, `VISUAL`, and `EDITOR`.

In the TUI, `/planner-config` is the shortcut for this diagnostic flow.

Example:

```text
/planner-config
```

The output includes:

- the current session plan path, resolved against the active OpenCode worktree
- planner tool availability from the plugin's perspective
- whether `submit_plan` is available for Plannotator review and `edit_plan` is available as the local-editor fallback
- editor precedence: `PLAN_VISUAL` -> `VISUAL` -> `EDITOR`
- which editor variable won
- the resolved editor command
- relevant runtime flags that affect planner behavior, such as `OPENCODE_EXPERIMENTAL_PLAN_MODE` and `OPENCODE_CLIENT`

This is the quickest way to understand why `edit_plan` is using a specific editor command before you try `/edit-plan`.

## Review Without Plannotator

In the TUI, you can use `/edit-plan` as a shortcut to ask the `plan` agent to reopen the current plan in your configured external editor. This routes through the existing `edit_plan` tool behavior.

Example:

```text
/edit-plan
```

This expects the current session to already have a plan file, and it still requires `PLAN_VISUAL`, `VISUAL`, or `EDITOR` to launch a blocking editor command.

If `submit_plan` is not registered by the runtime, the plugin's `edit_plan` tool gives the `plan` agent a fallback way to open the current plan in your configured external editor.

Example:

```text
If submit_plan is unavailable, call edit_plan so I can review the plan in my editor.
```

If you want to reopen the same plan after an initial review pass, prompt the `plan` agent with something like `edit the plan again externally`. That will cause it to call `edit_plan` again and reopen the current plan in the configured editor.

When the editor closes, `edit_plan` compares the plan before and after editing. If nothing changed, it reports that no changes were made. If the user edited the plan, the tool returns the previous and updated plan content so the `plan` agent can treat that as review feedback, summarize the edits, and continue planning from the revised plan.

Plan paths are resolved against the `worktree` supplied by OpenCode's tool context (falling back to its session `directory`). This keeps `/edit-plan` attached to the active worktree even when OpenCode itself was launched from another checkout.

`edit_plan` uses `PLAN_VISUAL` first, then `VISUAL`, then `EDITOR`. `PLAN_VISUAL` is useful when you want planner review to use a different editor from the rest of your shell tools. The command must launch a separate process and block until editing is complete.

Compatible examples:

- `PLAN_VISUAL="gvim -f"`
- `VISUAL="gvim -f"`
- `EDITOR="gedit --wait"`
- `EDITOR="kate --block"`
- `EDITOR="code --wait"`

These work because they open a separate editor process and do not try to take over the OpenCode TUI terminal.

If you use gVim and want a larger planner window, you can set geometry directly, for example:

- `PLAN_VISUAL="gvim -f -geometry 120x100"`

That opens gVim in the foreground with a window that is roughly 120 columns wide and 100 lines tall.

Bare terminal editors like `vim` or `nvim` are not sufficient on their own because the plugin does not hand the current TUI terminal over to the editor. If you want to use them, wrap them in a terminal-emulator command that opens a new window and waits for it to exit.

Examples:

- `EDITOR="gnome-terminal --wait -- nvim"`
- `EDITOR="kitty --wait nvim"`
- a small wrapper script for your terminal emulator that launches `vim` or `nvim` in a separate window and blocks until it exits

If `edit_plan` fails, the `plan` agent should fall back to telling you the plan file path and asking for review in chat.

If you edit the plan after calling `submit_plan`, the plugin treats that as a new draft. In that case the agent should stay in planner mode and call `submit_plan` again before `plan_exit`.

## Development

```bash
npm test
npm run test:integration:v1
npm run test:integration:v2
npm run debug:plan
npm run opencode:no-plannotator -- debug config
```

`npm run test:integration:v1` launches the installed OpenCode V1 binary with an isolated temporary home and the local package, then verifies that `/edit-plan`, `/planner-config`, `edit_plan`, `planner_config`, and `plan_prompt` are registered. Set `OPENCODE_PLANNER_OPENCODE_BIN` to test a specific V1 binary.

`npm run test:integration:v2` launches the installed OpenCode V2 server with an isolated temporary home and the local package. A deterministic test command creates a session plan, runs the real `editPlan` implementation through a scripted editor, and verifies the revised file plus the previous/updated plan output. Set `OPENCODE_PLANNER_OPENCODE2_BIN` to test a specific V2 binary.

`npm run debug:plan` checks the active OpenCode V1 runtime and reports whether the local repo plugin is loaded, whether `planner_config`, `plan_prompt`, `edit_plan`, `submit_plan`, and `plan_exit` are allowed by the `plan` agent, and whether they are actually registered as runtime tools. V2 loading can be verified with `opencode2 api get /api/plugin` after the project has initialized its plugin generation.

This is the fastest way to distinguish:

- prompt/config issues inside this repo
- runtime tool-registration issues in OpenCode or Plannotator

To test this plugin without the globally installed Plannotator plugin, use the sandbox launcher:

```bash
npm run opencode:no-plannotator
```

It starts OpenCode with an isolated temporary home/config, keeps the local repo plugin loaded, and filters out `@plannotator/opencode` from the plugin list without changing your real global config.

## Release process

1. Update `CHANGELOG.md`.
2. Bump the version in `package.json`.
3. Commit the release.
4. Create and push a git tag like `v0.3.2` for the release.
5. Let GitHub Actions publish to npm `latest`.
6. Publish matching GitHub release notes.

The repository includes GitHub Actions templates for CI and npm publishing from version tags.

## GitHub Actions setup

Configure npm Trusted Publishing for this package:

1. Open the `opencode-planner` package settings on npm.
2. Add a GitHub Actions trusted publisher.
3. Use:
   - GitHub user/org: `timrichardson`
   - Repository: `opencode-planner`
   - Workflow filename: `release.yml`

The release workflow publishes stable tags like `v0.3.2` to npm `latest` and creates matching GitHub release notes automatically.

Trusted Publishing uses GitHub OIDC and does not require an `NPM_TOKEN` secret for publishing.

## License

MIT
