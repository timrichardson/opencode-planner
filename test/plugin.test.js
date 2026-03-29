import test from "node:test"
import assert from "node:assert/strict"

import plannerPlugin from "../index.js"

test("config hook registers the plan agent", async () => {
  const plugin = await plannerPlugin()
  const cfg = {}

  await plugin.config(cfg)

  assert.equal(cfg.agent.plan.mode, "primary")
  assert.equal(cfg.agent.plan.permission.bash, "deny")
  assert.equal(cfg.agent.plan.permission.submit_plan, "allow")
})

test("chat.message injects a planner reminder part", async () => {
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
})

test("system transform only applies after planner messages", async () => {
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
  assert.match(system.system[0], /submit_plan/)
})
