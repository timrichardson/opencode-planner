# opencode-planner

`opencode-planner` is an OpenCode plugin that adds a dedicated `plan` agent for read-only planning before implementation. Its functionality is an emulation of the experimental plan agent (it has no hard dependency on EXPERIMENTAL_PLAN_MODE=1, altough that setting enables a tool called plan_exit which this plugin will use if available). That is, it likes to use sub-agents and a structured approach to planning, asks clarifying questions, and finally it produces a markdown file. 

When Plannotator is installed, it can submit the finished plan for richer review. Without Plannotator, it can open the plan in your configured external editor for review.

After review, the agent can hand back to implementation mode by calling `plan_exit` only when the host runtime exposes that tool. In current OpenCode builds, that means experimental plan mode must be enabled and the client must be `cli`. If it's not enabled, you need to prompt the build agent to start work.

Repository: <https://github.com/timrichardson/opencode-planner>

## Install for OpenCode

Add this to `opencode.json`:

```json
{
  "plugin": ["opencode-planner@beta"]
}
```

Then restart OpenCode.

`beta` is the recommended install channel until the package has a stable release. This keeps prereleases off `latest`.

If you want reproducible installs instead of automatic plugin refreshes, pin an exact version:

```json
{
  "plugin": ["opencode-planner@0.1.1-beta.1"]
}
```

## What it does

- adds a `plan` agent intended for design and implementation planning
- constrains that agent to read-only tools plus markdown plan editing
- injects a system reminder that keeps the planning workflow explicit
- lets users replace the plugin's base `plan` prompt with their own `agent.plan.prompt`
- lets users override agent settings such as `agent.plan.model` and provider-specific options like `agent.plan.reasoningEffort`
- denies `submit_plan`, `edit_plan`, and `plan_exit` to the built-in `general` and `explore` subagents so review and implementation handoff stay on the primary `plan` agent
- exposes a `plan_prompt` tool so the `plan` agent can reveal the plugin's prompt basis for customization
- exposes an `edit_plan` tool so the `plan` agent can open the current plan in the configured external editor
- uses `submit_plan` for review when available, otherwise falls back to external-editor review
- keeps the agent in planner mode if the plan file changed after `submit_plan`; the revised plan must be resubmitted before `plan_exit`
- can leave planner mode with `plan_exit` after approval when experimental plan mode is enabled in the CLI runtime

## Customize the plan agent

If you set `agent.plan.prompt`, the plugin replaces its built-in base planning prompt with your text. Other agent settings, such as `agent.plan.model` and provider-specific options like `agent.plan.reasoningEffort`, are merged in normally.

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

The runtime planner reminder still applies, so the agent stays in planner mode and continues to use the review handoff flow. That reminder is injected by the plugin at runtime and is not customized through `agent.plan.prompt`.

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

## Review Without Plannotator

If `submit_plan` is not registered by the runtime, the plugin's `edit_plan` tool gives the `plan` agent a fallback way to open the current plan in your configured external editor.

Example:

```text
If submit_plan is unavailable, call edit_plan so I can review the plan in my editor.
```

If you want to reopen the same plan after an initial review pass, prompt the `plan` agent with something like `edit the plan again externally`. That will cause it to call `edit_plan` again and reopen the current plan in the configured editor.

When the editor closes, `edit_plan` compares the plan before and after editing. If nothing changed, it reports that no changes were made. If the user edited the plan, the tool returns the previous and updated plan content so the `plan` agent can treat that as review feedback, summarize the edits, and continue planning from the revised plan.

`edit_plan` uses `PLAN_VISUAL` first, then `VISUAL`, then `EDITOR`. `PLAN_VISUAL` is useful when you want planner review to use a different editor from the rest of your shell tools. The command must launch a separate process and block until editing is complete.

Compatible examples:

- `PLAN_VISUAL="gvim -f"`
- `VISUAL="gvim -f"`
- `EDITOR="gedit --wait"`
- `EDITOR="kate --block"`
- `EDITOR="code --wait"`

These work because they open a separate editor process and do not try to take over the OpenCode TUI terminal.

Bare terminal editors like `vim` or `nvim` are not sufficient on their own because the plugin does not hand the current TUI terminal over to the editor. If you want to use them, wrap them in a terminal-emulator command that opens a new window and waits for it to exit.

Examples:

- `EDITOR="gnome-terminal --wait -- nvim"`
- `EDITOR="kitty --wait nvim"`
- a small wrapper script for your terminal emulator that launches `vim` or `nvim` in a separate window and blocks until it exits

If `edit_plan` fails, the `plan` agent should fall back to telling you the plan file path and asking for review in chat.

If you edit the plan after calling `submit_plan`, the plugin treats that as a new draft. In that case the agent should stay in planner mode and call `submit_plan` again before `plan_exit`.

## Auto-updates

OpenCode installs and updates npm plugins automatically. During the beta phase of this plugin, `opencode-planner@beta` gives the smoothest update path for most users.

For this package's current prerelease phase, use `opencode-planner@beta` instead of `@latest`.

- `@beta`: pick up new prerelease plugin versions on restart without opting into a future stable channel
- `@latest`: reserved for stable releases
- exact version pin: stay fixed until the config is changed deliberately

If OpenCode appears to keep an older cached plugin, clear the cache under `~/.cache/opencode/` and restart.

## Development

```bash
npm test
npm run debug:plan
npm run opencode:no-plannotator -- debug config
```

`npm run debug:plan` checks the active OpenCode runtime and reports whether the local repo plugin is loaded, whether `plan_prompt`, `edit_plan`, `submit_plan`, and `plan_exit` are allowed by the `plan` agent, and whether they are actually registered as runtime tools.

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
4. Create and push a git tag like `v0.1.1-beta.1` for prereleases or `v0.1.1` for stable releases.
5. Let GitHub Actions publish to npm using the correct dist-tag.
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

The release workflow publishes prerelease tags like `v0.1.1-beta.1` to the npm `beta` dist-tag, stable tags like `v0.1.1` to `latest`, and creates matching GitHub release notes automatically.

Trusted Publishing uses GitHub OIDC and does not require an `NPM_TOKEN` secret for publishing.

## License

MIT
