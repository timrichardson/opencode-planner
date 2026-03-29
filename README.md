# opencode-planner

`opencode-planner` is an OpenCode plugin that adds a dedicated `plan` agent for read-only planning before implementation.

Repository: <https://github.com/timrichardson/opencode-planner>

## Install for OpenCode

Add this to `opencode.json`:

```json
{
  "plugin": ["opencode-planner@latest"]
}
```

Then restart OpenCode.

If you want reproducible installs instead of automatic plugin refreshes, pin an exact version:

```json
{
  "plugin": ["opencode-planner@0.1.0"]
}
```

## What it does

- adds a `plan` agent intended for design and implementation planning
- constrains that agent to read-only tools plus markdown plan editing
- injects a system reminder that keeps the planning workflow explicit

## Auto-updates

OpenCode installs npm plugins automatically. Using `opencode-planner@latest` gives the smoothest update path for most users.

- `@latest`: pick up new published plugin versions on restart
- exact version pin: stay fixed until the config is changed deliberately

If OpenCode appears to keep an older cached plugin, clear the cache under `~/.cache/opencode/` and restart.

## Development

```bash
npm test
```

## Release process

1. Update `CHANGELOG.md`.
2. Bump the version in `package.json`.
3. Commit the release.
4. Create and push a git tag like `v0.1.1`.
5. Publish to npm.
6. Publish matching GitHub release notes.

The repository includes GitHub Actions templates for CI and npm publishing from version tags.

## GitHub Actions setup

Set this repository secret for automated npm publishing:

- `NPM_TOKEN`

The release workflow publishes on version tags like `v0.1.0` and creates GitHub release notes automatically.

## License

MIT
