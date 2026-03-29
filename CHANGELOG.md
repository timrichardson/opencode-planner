# Changelog

## 0.1.1-beta.11

- add planner-specific `PLAN_VISUAL` support for external plan review editor selection
- treat external `edit_plan` changes as plan review feedback and require resubmission before `plan_exit`

## 0.1.1-beta.10

- deny `submit_plan` and `plan_exit` to the built-in `general` and `explore` subagents used by the planner
- clarify npm plugin update wording in the README and remove redundant prompt-customization intro text

## 0.1.1-beta.9

- fix README documentation for `agent.plan.prompt` replacement behavior
- restore `plan_prompt` tool documentation and note the build-agent fallback when `plan_exit` is unavailable

## 0.1.1-beta.8

- document `agent.plan.model` customization with OpenAI `reasoningEffort` examples
- fix README customization docs to match the current prompt-appending behavior

## 0.1.1-beta.7

- replace `softprops/action-gh-release@v2` with `gh release create` in the release workflow
- avoid the GitHub Actions Node 20 deprecation warning from the release step

## 0.1.1-beta.6

- let users replace the plugin's base `agent.plan.prompt` instead of appending to it
- add a `plan_prompt` tool so the `plan` agent can reveal the plugin prompt basis for customization

## 0.1.1-beta.5

- gate `plan_exit` instructions on the OpenCode experimental plan-mode runtime flags
- fall back to manual chat review when `submit_plan` is unavailable
- add runtime debug and sandbox helpers for faster planner testing

## 0.1.1-beta.4

- publish README updates describing the planning workflow and plannotator integration

## 0.1.1-beta.3

- restore GitHub release permissions in the release workflow
- stop tracking IDE project files in git

## 0.1.1-beta.2

- test GitHub Actions release publishing via npm Trusted Publishing

## 0.1.1-beta.1

- mark npm publishes as public so first-time prerelease publication works with provenance enabled

## 0.1.1-beta.0

- mark the package as an explicit prerelease line
- publish prereleases to the npm `beta` dist-tag instead of `latest`
- document OpenCode installation via `opencode-planner@beta`

## 0.1.0

- initial standalone npm package for the `plan` agent plugin
- includes OpenCode install instructions, CI, and npm publish workflow templates
