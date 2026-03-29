import test from "node:test"
import assert from "node:assert/strict"

import plannerPlugin from "../index.js"

async function withEnv(env, fn) {
  const previous = {
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
      assert.equal(cfg.agent.plan.permission.submit_plan, "allow")
      assert.equal(cfg.agent.plan.permission.plan_exit, undefined)
      assert.match(cfg.agent.plan.prompt, /if the submit_plan tool is available/i)
      assert.match(cfg.agent.plan.prompt, /ask for review in chat/i)
      assert.doesNotMatch(cfg.agent.plan.prompt, /plan_exit/)
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
      assert.match(system.system[0], /ask for review in chat/i)
      assert.match(system.system[0], /plan_exit/)
    },
  )
})
