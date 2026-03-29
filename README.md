# opencode-planner

`opencode-planner` is an experimental OpenCode plugin that adds a dedicated `plan` agent for read-only planning before implementation.

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
```

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
