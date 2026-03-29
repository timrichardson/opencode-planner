import test from "node:test"
import assert from "node:assert/strict"
import { mkdir, rm, writeFile } from "node:fs/promises"

import plannerPlugin from "../index.js"

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
      assert.equal(cfg.agent.plan.permission.plan_prompt, "allow")
      assert.equal(cfg.agent.plan.permission.submit_plan, "allow")
      assert.equal(cfg.agent.plan.permission.plan_exit, undefined)
      assert.match(cfg.agent.plan.prompt, /if the submit_plan tool is available/i)
      assert.match(cfg.agent.plan.prompt, /call edit_plan to open the markdown plan/i)
      assert.match(cfg.agent.plan.prompt, /ask for review in chat/i)
      assert.doesNotMatch(cfg.agent.plan.prompt, /plan_exit/)
    },
  )
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
      assert.equal(cfg.agent.general.permission.plan_exit, "deny")
      assert.equal(cfg.agent.general.permission.submit_plan, "deny")
      assert.equal(cfg.agent.general.permission.webfetch, "deny")
      assert.equal(cfg.agent.explore.permission.edit_plan, "deny")
      assert.equal(cfg.agent.explore.permission.plan_exit, "deny")
      assert.equal(cfg.agent.explore.permission.submit_plan, "deny")
    },
  )
})

test("edit_plan opens the current session plan in the configured editor", async () => {
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

          assert.match(output, /edited in your external editor/i)
          assert.match(output, /# Edited plan/)
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
      assert.match(output.parts[0].text, /ask for review in chat/i)
      assert.match(output.parts[0].text, /plan_exit/)
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
      assert.match(system.system[0], /ask for review in chat/i)
      assert.match(system.system[0], /plan_exit/)
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
    },
  )
})
