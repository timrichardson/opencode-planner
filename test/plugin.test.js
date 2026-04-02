import test from "node:test"
import assert from "node:assert/strict"
import { mkdir, rm, writeFile } from "node:fs/promises"

import plannerPlugin, { plugin } from "../index.js"

test("package exports the plugin as both named and default exports", async () => {
  assert.equal(plugin, plannerPlugin)
})

async function withEnv(env, fn) {
  const previous = {
    PLAN_VISUAL: process.env.PLAN_VISUAL,
    VISUAL: process.env.VISUAL,
    EDITOR: process.env.EDITOR,
    OPENCODE_EXPERIMENTAL: process.env.OPENCODE_EXPERIMENTAL,
    OPENCODE_EXPERIMENTAL_PLAN_MODE: process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE,
    OPENCODE_CLIENT: process.env.OPENCODE_CLIENT,
  }

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }

  try {
    await fn()
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}

async function withPlanFile(filePath, content, fn) {
  await mkdir(new URL("../.opencode/plans/", import.meta.url), { recursive: true })
  await writeFile(new URL(`../${filePath}`, import.meta.url), content)

  try {
    await fn()
  } finally {
    await rm(new URL(`../${filePath}`, import.meta.url), { force: true })
  }
}

test("config hook registers the plan agent without plan_exit by default", async () => {
  await withEnv(
    {
      OPENCODE_EXPERIMENTAL: undefined,
      OPENCODE_EXPERIMENTAL_PLAN_MODE: undefined,
      OPENCODE_CLIENT: undefined,
    },
    async () => {
      const plugin = await plannerPlugin()
      const cfg = {}

      await plugin.config(cfg)

      assert.equal(cfg.agent.plan.mode, "primary")
      assert.equal(cfg.agent.plan.permission.bash, "deny")
      assert.equal(cfg.agent.plan.permission.edit_plan, "allow")
      assert.equal(cfg.agent.plan.permission.planner_config, "allow")
      assert.equal(cfg.agent.plan.permission.plan_prompt, "allow")
      assert.equal(cfg.agent.plan.permission.submit_plan, "allow")
      assert.equal(cfg.agent.plan.permission.plan_exit, undefined)
      assert.equal(cfg.command["edit-plan"].description, "Reopen the current plan in your editor")
      assert.equal(cfg.command["edit-plan"].agent, "plan")
      assert.match(cfg.command["edit-plan"].template, /calling the edit_plan tool/i)
      assert.equal(cfg.command["planner-config"].description, "Show planner configuration details")
      assert.equal(cfg.command["planner-config"].agent, "plan")
      assert.match(cfg.command["planner-config"].template, /call the planner_config tool/i)
      assert.match(cfg.agent.plan.prompt, /if the submit_plan tool is available/i)
      assert.match(cfg.agent.plan.prompt, /call edit_plan to open the markdown plan/i)
      assert.match(cfg.agent.plan.prompt, /treat that as review feedback on the plan/i)
      assert.match(cfg.agent.plan.prompt, /ask for review in chat/i)
      assert.doesNotMatch(cfg.agent.plan.prompt, /plan_exit/)
    },
  )
})

test("config hook adds planner commands without overwriting user commands", async () => {
  const plugin = await plannerPlugin()
  const cfg = {
    command: {
      custom: {
        template: "Do something custom.",
      },
      "edit-plan": {
        template: "Use my custom edit-plan flow.",
        description: "Custom edit plan",
        agent: "general",
      },
      "planner-config": {
        template: "Use my custom planner-config flow.",
        description: "Custom planner config",
        agent: "general",
      },
    },
  }

  await plugin.config(cfg)

  assert.equal(cfg.command.custom.template, "Do something custom.")
  assert.equal(cfg.command["edit-plan"].template, "Use my custom edit-plan flow.")
  assert.equal(cfg.command["edit-plan"].description, "Custom edit plan")
  assert.equal(cfg.command["edit-plan"].agent, "general")
  assert.equal(cfg.command["planner-config"].template, "Use my custom planner-config flow.")
  assert.equal(cfg.command["planner-config"].description, "Custom planner config")
  assert.equal(cfg.command["planner-config"].agent, "general")
})

test("config hook lets users replace the plugin prompt", async () => {
  await withEnv(
    {
      OPENCODE_EXPERIMENTAL: undefined,
      OPENCODE_EXPERIMENTAL_PLAN_MODE: undefined,
      OPENCODE_CLIENT: undefined,
    },
    async () => {
      const plugin = await plannerPlugin()
      const cfg = {
        agent: {
          plan: {
            prompt: "Use my custom plan instructions only.",
            permission: {
              webfetch: "deny",
            },
          },
        },
      }

      await plugin.config(cfg)

      assert.equal(cfg.agent.plan.prompt, "Use my custom plan instructions only.")
      assert.equal(cfg.agent.plan.permission.webfetch, "deny")
      assert.equal(cfg.agent.plan.permission.bash, "deny")
      assert.equal(cfg.agent.plan.permission.plan_prompt, "allow")
      assert.doesNotMatch(cfg.agent.plan.prompt, /if the submit_plan tool is available/i)
    },
  )
})

test("config hook enables plan_exit when experimental plan mode is active", async () => {
  await withEnv(
    {
      OPENCODE_EXPERIMENTAL: undefined,
      OPENCODE_EXPERIMENTAL_PLAN_MODE: "1",
      OPENCODE_CLIENT: "cli",
    },
    async () => {
      const plugin = await plannerPlugin()
      const cfg = {}

      await plugin.config(cfg)

      assert.equal(cfg.agent.plan.permission.plan_exit, "allow")
      assert.match(cfg.agent.plan.prompt, /plan_exit/)
    },
  )
})

test("config hook denies review handoff tools for planner subagents", async () => {
  await withEnv(
    {
      OPENCODE_EXPERIMENTAL: undefined,
      OPENCODE_EXPERIMENTAL_PLAN_MODE: "1",
      OPENCODE_CLIENT: "cli",
    },
    async () => {
      const plugin = await plannerPlugin()
      const cfg = {
        agent: {
          general: {
            permission: {
              edit_plan: "allow",
              plan_exit: "allow",
              submit_plan: "allow",
              webfetch: "deny",
            },
          },
          explore: {
            permission: {
              edit_plan: "allow",
              plan_exit: "allow",
              submit_plan: "allow",
            },
          },
        },
      }

      await plugin.config(cfg)

      assert.equal(cfg.agent.general.permission.edit_plan, "deny")
      assert.equal(cfg.agent.general.permission.planner_config, "deny")
      assert.equal(cfg.agent.general.permission.plan_exit, "deny")
      assert.equal(cfg.agent.general.permission.submit_plan, "deny")
      assert.equal(cfg.agent.general.permission.webfetch, "deny")
      assert.equal(cfg.agent.explore.permission.edit_plan, "deny")
      assert.equal(cfg.agent.explore.permission.planner_config, "deny")
      assert.equal(cfg.agent.explore.permission.plan_exit, "deny")
      assert.equal(cfg.agent.explore.permission.submit_plan, "deny")
    },
  )
})

test("planner_config reports editor precedence", async () => {
  const cases = [
    {
      env: {
        PLAN_VISUAL: undefined,
        VISUAL: undefined,
        EDITOR: "code --wait",
      },
      source: "EDITOR",
      command: "code --wait",
    },
    {
      env: {
        PLAN_VISUAL: undefined,
        VISUAL: "gvim -f",
        EDITOR: "code --wait",
      },
      source: "VISUAL",
      command: "gvim -f",
    },
    {
      env: {
        PLAN_VISUAL: "gedit --wait",
        VISUAL: "gvim -f",
        EDITOR: "code --wait",
      },
      source: "PLAN_VISUAL",
      command: "gedit --wait",
    },
  ]

  for (const entry of cases) {
    await withEnv(entry.env, async () => {
      const plugin = await plannerPlugin()
      const output = await plugin.tool.planner_config.execute(
        {},
        {
          sessionID: "ses_config",
        },
      )

      assert.ok(output.includes(`- Selected source: \`${entry.source}\``))
      assert.ok(output.includes(`- Selected command: \`${entry.command}\``))
      assert.match(output, /submit_plan: allowed by the `plan` agent and required for Plannotator review/i)
      assert.match(output, /edit_plan: allowed by the `plan` agent as the fallback local-editor review tool/i)
      assert.match(output, /Precedence: `PLAN_VISUAL` -> `VISUAL` -> `EDITOR`/)
      assert.match(output, /Current session plan path: `\.opencode\/plans\/ses_config\.md`/)
    })
  }
})

test("planner_config reports when no editor is configured", async () => {
  await withEnv(
    {
      PLAN_VISUAL: undefined,
      VISUAL: undefined,
      EDITOR: undefined,
    },
    async () => {
      const plugin = await plannerPlugin()
      const output = await plugin.tool.planner_config.execute(
        {},
        {
          sessionID: "ses_config",
        },
      )

      assert.match(output, /PLAN_VISUAL: <unset>/)
      assert.match(output, /VISUAL: <unset>/)
      assert.match(output, /EDITOR: <unset>/)
      assert.match(output, /Selected source: none/)
      assert.match(output, /Selected command: <unset>/)
    },
  )
})

test("planner_config reports plan_exit expectation from runtime flags", async () => {
  await withEnv(
    {
      OPENCODE_EXPERIMENTAL: undefined,
      OPENCODE_EXPERIMENTAL_PLAN_MODE: "1",
      OPENCODE_CLIENT: "cli",
    },
    async () => {
      const plugin = await plannerPlugin()
      const output = await plugin.tool.planner_config.execute(
        {},
        {
          sessionID: "ses_config",
        },
      )

      assert.match(output, /OPENCODE_EXPERIMENTAL_PLAN_MODE: `1`/)
      assert.match(output, /OPENCODE_CLIENT: `cli`/)
      assert.match(output, /plan_exit expected: yes/)
    },
  )
})

test("edit_plan reports when the editor closes without changes", async () => {
  await withEnv(
    {
      PLAN_VISUAL: undefined,
      VISUAL: "true",
      EDITOR: "false",
    },
    async () => {
      await withPlanFile(
        ".opencode/plans/ses_edit.md",
        "# Edited plan\n\n- reviewed\n",
        async () => {
          const plugin = await plannerPlugin()
          const output = await plugin.tool.edit_plan.execute(
            {},
            {
              sessionID: "ses_edit",
            },
          )

          assert.match(output, /No changes were made/i)
          assert.match(output, /## Current plan/)
          assert.match(output, /# Edited plan/)
        },
      )
    },
  )
})

test("edit_plan reports external edits when the plan changes", async () => {
  await withEnv(
    {
      PLAN_VISUAL: "sh -lc 'printf \"# Revised plan\\n\\n- updated\\n\" > \"$1\"' sh",
      VISUAL: "false",
      EDITOR: "false",
    },
    async () => {
      await withPlanFile(
        ".opencode/plans/ses_edit_changed.md",
        "# Original plan\n\n- original\n",
        async () => {
          const plugin = await plannerPlugin()
          const output = await plugin.tool.edit_plan.execute(
            {},
            {
              sessionID: "ses_edit_changed",
            },
          )

          assert.match(output, /The user edited the plan externally/i)
          assert.match(output, /Treat these external edits as review feedback/i)
          assert.match(output, /## Previous plan/)
          assert.match(output, /# Original plan/)
          assert.match(output, /## Updated plan/)
          assert.match(output, /# Revised plan/)
        },
      )
    },
  )
})

test("edit_plan prefers PLAN_VISUAL over VISUAL and EDITOR", async () => {
  await withEnv(
    {
      PLAN_VISUAL: "true",
      VISUAL: "false",
      EDITOR: "false",
    },
    async () => {
      await withPlanFile(
        ".opencode/plans/ses_edit_override.md",
        "# Edited with PLAN_VISUAL\n",
        async () => {
          const plugin = await plannerPlugin()
          const output = await plugin.tool.edit_plan.execute(
            {},
            {
              sessionID: "ses_edit_override",
            },
          )

          assert.match(output, /# Edited with PLAN_VISUAL/)
        },
      )
    },
  )
})

test("edit_plan reports when no blocking editor command is configured", async () => {
  await withEnv(
    {
      PLAN_VISUAL: undefined,
      VISUAL: undefined,
      EDITOR: undefined,
    },
    async () => {
      const plugin = await plannerPlugin()
      await assert.rejects(
        plugin.tool.edit_plan.execute(
          {},
          {
            sessionID: "ses_edit",
          },
        ),
        /None of `PLAN_VISUAL`, `VISUAL`, or `EDITOR` is set/i,
      )
    },
  )
})

test("plan_exit stays blocked if the plan changed after submit_plan", async () => {
  await withEnv(
    {
      OPENCODE_EXPERIMENTAL: undefined,
      OPENCODE_EXPERIMENTAL_PLAN_MODE: "1",
      OPENCODE_CLIENT: "cli",
    },
    async () => {
      await withPlanFile(
        ".opencode/plans/ses_dirty.md",
        "# Submitted plan\n\n- step one\n",
        async () => {
          const plugin = await plannerPlugin()

          await plugin["tool.execute.after"](
            {
              tool: "submit_plan",
              sessionID: "ses_dirty",
              callID: "call_submit",
              args: {
                plan: "/tmp/ignored.md",
              },
            },
            {
              title: "submit_plan",
              output: "ok",
              metadata: {},
            },
          )

          await writeFile(new URL("../.opencode/plans/ses_dirty.md", import.meta.url), "# Revised plan\n")

          await assert.rejects(
            plugin["tool.execute.before"](
              {
                tool: "plan_exit",
                sessionID: "ses_dirty",
                callID: "call_exit",
              },
              {
                args: {},
              },
            ),
            /changed since the last submit_plan review/i,
          )
        },
      )
    },
  )
})

test("plan_exit remains available when the submitted plan is unchanged", async () => {
  await withEnv(
    {
      OPENCODE_EXPERIMENTAL: undefined,
      OPENCODE_EXPERIMENTAL_PLAN_MODE: "1",
      OPENCODE_CLIENT: "cli",
    },
    async () => {
      await withPlanFile(
        ".opencode/plans/ses_clean.md",
        "# Submitted plan\n\n- step one\n",
        async () => {
          const plugin = await plannerPlugin()

          await plugin["tool.execute.after"](
            {
              tool: "submit_plan",
              sessionID: "ses_clean",
              callID: "call_submit",
              args: {
                plan: "/tmp/ignored.md",
              },
            },
            {
              title: "submit_plan",
              output: "ok",
              metadata: {},
            },
          )

          await assert.doesNotReject(
            plugin["tool.execute.before"](
              {
                tool: "plan_exit",
                sessionID: "ses_clean",
                callID: "call_exit",
              },
              {
                args: {},
              },
            ),
          )
        },
      )
    },
  )
})

test("chat.message injects a planner reminder part", async () => {
  await withEnv(
    {
      OPENCODE_EXPERIMENTAL: undefined,
      OPENCODE_EXPERIMENTAL_PLAN_MODE: "1",
      OPENCODE_CLIENT: "cli",
    },
    async () => {
      const plugin = await plannerPlugin()
      const input = {
        agent: "plan",
        sessionID: "ses_123",
      }
      const output = {
        message: {
          id: "msg_123",
          sessionID: "ses_123",
        },
        parts: [],
      }

      await plugin["chat.message"](input, output)

      assert.equal(output.parts.length, 1)
      assert.equal(output.parts[0].type, "text")
      assert.match(output.parts[0].id, /^prt_/)
      assert.match(output.parts[0].text, /Planner mode is active\./)
      assert.match(output.parts[0].text, /if the submit_plan tool is available/i)
      assert.match(output.parts[0].text, /call edit_plan to open the markdown plan/i)
      assert.match(output.parts[0].text, /treat that as review feedback on the plan/i)
      assert.match(output.parts[0].text, /ask for review in chat/i)
      assert.match(output.parts[0].text, /plan_exit/)
      assert.match(output.parts[0].text, /If the plan changed after submit_plan/i)
    },
  )
})

test("system transform only applies after planner messages", async () => {
  await withEnv(
    {
      OPENCODE_EXPERIMENTAL: undefined,
      OPENCODE_EXPERIMENTAL_PLAN_MODE: "1",
      OPENCODE_CLIENT: "cli",
    },
    async () => {
      const plugin = await plannerPlugin()
      const system = { system: [] }

      await plugin["experimental.chat.system.transform"]({ sessionID: "ses_other" }, system)
      assert.deepEqual(system.system, [])

      await plugin["chat.message"](
        {
          agent: "plan",
          sessionID: "ses_plan",
        },
        {
          message: {
            id: "msg_plan",
            sessionID: "ses_plan",
          },
          parts: [],
        },
      )

      await plugin["experimental.chat.system.transform"]({ sessionID: "ses_plan" }, system)

      assert.equal(system.system.length, 1)
      assert.match(system.system[0], /if the submit_plan tool is available/i)
      assert.match(system.system[0], /call edit_plan to open the markdown plan/i)
      assert.match(system.system[0], /treat that as review feedback on the plan/i)
      assert.match(system.system[0], /ask for review in chat/i)
      assert.match(system.system[0], /plan_exit/)
      assert.match(system.system[0], /If the plan changed after submit_plan/i)
    },
  )
})

test("plan_prompt tool returns the plugin prompt basis without plan_exit by default", async () => {
  await withEnv(
    {
      OPENCODE_EXPERIMENTAL: undefined,
      OPENCODE_EXPERIMENTAL_PLAN_MODE: undefined,
      OPENCODE_CLIENT: undefined,
    },
    async () => {
      const plugin = await plannerPlugin()
      const output = await plugin.tool.plan_prompt.execute(
        {},
        {
          sessionID: "ses_tool",
        },
      )

      assert.match(output, /# opencode-planner prompt basis/)
      assert.match(output, /## Base prompt/)
      assert.match(output, /## Planner reminder/)
      assert.match(output, /injected by the plugin at runtime/i)
      assert.match(output, /not customized through `agent\.plan\.prompt`/i)
      assert.match(output, /call edit_plan to open the markdown plan/i)
      assert.match(output, /treat that as review feedback on the plan/i)
      assert.match(output, /```json/)
      assert.match(output, /"agent": \{/)
      assert.match(output, /\.opencode\/plans\/ses_tool\.md/)
      assert.match(output, /agent\.plan\.prompt/)
      assert.doesNotMatch(output, /call plan_exit/)
    },
  )
})

test("plan_prompt tool mentions plan_exit when experimental plan mode is active", async () => {
  await withEnv(
    {
      OPENCODE_EXPERIMENTAL: undefined,
      OPENCODE_EXPERIMENTAL_PLAN_MODE: "1",
      OPENCODE_CLIENT: "cli",
    },
    async () => {
      const plugin = await plannerPlugin()
      const output = await plugin.tool.plan_prompt.execute(
        {},
        {
          sessionID: "ses_tool",
        },
      )

      assert.match(output, /call plan_exit/)
      assert.match(output, /If the plan changed after submit_plan/i)
    },
  )
})
