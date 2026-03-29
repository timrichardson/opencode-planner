# opencode-planner

`opencode-planner` is an OpenCode plugin that adds a dedicated `plan` agent for read-only planning before implementation. It's based on the experimental plan agent. That is, it likes to use sub-agents and a structured approach to planning.
It asks clarifying questions, and produces a markdown file. When Plannotator is installed, it can submit the finished plan for richer review. Without Plannotator, it falls back to a normal chat-based review handoff.

After review, the agent can hand back to implementation mode by calling `plan_exit` only when the host runtime exposes that tool. In current OpenCode builds, that means experimental plan mode must be enabled and the client must be `cli`.

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

You can also customize the `plan` agent in the same config. The plugin keeps its default planner prompt and appends your custom prompt, so this is a good place to add repo-specific planning rules or a dedicated model with a specific reasoning level:

```json
{
  "plugin": ["opencode-planner@beta"],
  "agent": {
    "plan": {
      "model": "openai/gpt-5.4",
      "reasoningEffort": "high",
      "prompt": "Before writing the plan, inspect the current architecture, identify likely touched files, and call out test coverage gaps. Prefer phased plans with explicit validation steps."
    }
  }
}
```

This extends the built-in planning instructions rather than replacing them.

## What it does

- adds a `plan` agent intended for design and implementation planning
- constrains that agent to read-only tools plus markdown plan editing
- injects a system reminder that keeps the planning workflow explicit
- lets users extend the plugin's base `plan` prompt with their own `agent.plan.prompt`
- lets users override agent settings such as `agent.plan.model` and provider-specific options like `agent.plan.reasoningEffort`
- uses `submit_plan` for review when available, otherwise falls back to manual chat review
- can leave planner mode with `plan_exit` after approval when experimental plan mode is enabled in the CLI runtime

## Customize the plan agent

If you set `agent.plan.prompt`, the plugin appends your text after its built-in planning instructions. Other agent settings, such as `agent.plan.model` and provider-specific options like `agent.plan.reasoningEffort`, are merged in normally.

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

## Auto-updates

OpenCode installs npm plugins automatically. During the prerelease phase, `opencode-planner@beta` gives the smoothest update path for most users.

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

`npm run debug:plan` checks the active OpenCode runtime and reports whether the local repo plugin is loaded, whether `submit_plan` and `plan_exit` are allowed by the `plan` agent, and whether they are actually registered as runtime tools.

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
