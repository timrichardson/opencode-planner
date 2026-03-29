# Changelog

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
