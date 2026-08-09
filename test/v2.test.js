import test from "node:test"
import assert from "node:assert/strict"

import plannerPlugin from "../server.js"

function runtime() {
  const agents = new Map()
  const commands = new Map()
  const tools = []
  const hooks = { session: {}, tool: {} }
  const defaults = (id) => ({
    id,
    name: id,
    request: { settings: {}, headers: {}, body: {} },
    mode: "primary",
    hidden: false,
    permissions: [{ action: "*", resource: "*", effect: "allow" }],
  })

  return {
    agents,
    commands,
    tools,
    hooks,
    context: {
      app: { name: "OpenCode", version: "test", channel: "dev" },
      agent: {
        transform: async (callback) => callback({
          get: (id) => agents.get(id),
          update: (id, update) => {
            const current = agents.get(id) ?? defaults(id)
            agents.set(id, current)
            update(current)
          },
        }),
      },
      command: {
        transform: async (callback) => callback({
          get: (name) => commands.get(name),
          update: (name, update) => {
            const current = commands.get(name) ?? { name, template: "" }
            commands.set(name, current)
            update(current)
          },
        }),
      },
      tool: {
        transform: async (callback) => callback({ add: (tool) => tools.push(tool) }),
        hook: async (name, callback) => {
          hooks.tool[name] = callback
        },
      },
      session: {
        get: async () => ({ location: { directory: "/tmp/planner-project" } }),
        hook: async (name, callback) => {
          hooks.session[name] = callback
        },
      },
    },
  }
}

test("exports a V2 server plugin definition", () => {
  assert.equal(plannerPlugin.id, "opencode-planner")
  assert.equal(typeof plannerPlugin.setup, "function")
})

test("registers the V2 plan agent, commands, tools, and hooks", async () => {
  const host = runtime()
  await plannerPlugin.setup(host.context)

  assert.equal(host.agents.get("plan").mode, "primary")
  assert.match(host.agents.get("plan").system, /Stay in planning mode/)
  assert.deepEqual(
    host.tools.map((tool) => tool.name),
    ["plan_prompt", "edit_plan", "planner_config"],
  )
  assert.equal(host.commands.get("edit-plan").agent, "plan")
  assert.equal(host.commands.get("planner-config").agent, "plan")
  assert.equal(typeof host.hooks.session.context, "function")
  assert.equal(typeof host.hooks.tool["execute.before"], "function")
  assert.equal(typeof host.hooks.tool["execute.after"], "function")

  const permissions = host.agents.get("plan").permissions
  assert.deepEqual(permissions.at(-1), { action: "edit", resource: "**/*.spec.md", effect: "allow" })
  assert.ok(permissions.some((rule) => rule.action === "*" && rule.effect === "deny"))
  assert.ok(permissions.some((rule) => rule.action === "subagent" && rule.resource === "explore"))
  assert.ok(host.agents.get("general").permissions.some((rule) => rule.action === "submit_plan" && rule.effect === "deny"))
})

test("preserves configured V2 prompts and commands", async () => {
  const host = runtime()
  host.agents.set("plan", {
    id: "plan",
    name: "plan",
    request: { settings: {}, headers: {}, body: {} },
    system: "Custom planner prompt",
    mode: "primary",
    hidden: false,
    permissions: [],
  })
  host.commands.set("edit-plan", { name: "edit-plan", template: "Custom command", agent: "build" })

  await plannerPlugin.setup(host.context)

  assert.equal(host.agents.get("plan").system, "Custom planner prompt")
  assert.equal(host.commands.get("edit-plan").template, "Custom command")
  assert.equal(host.commands.get("edit-plan").agent, "build")
})

test("injects the planner reminder using actual V2 tool availability", async () => {
  const host = runtime()
  await plannerPlugin.setup(host.context)
  const event = {
    sessionID: "ses_v2",
    agent: "plan",
    system: [],
    tools: { plan_exit: { description: "Exit", input: {} } },
  }

  await host.hooks.session.context(event)

  assert.equal(event.system.length, 1)
  assert.equal(event.system[0].type, "text")
  assert.match(event.system[0].text, /call the plan_exit tool/)

  const prompt = await host.tools.find((tool) => tool.name === "plan_prompt").execute({}, { sessionID: "ses_v2" })
  assert.match(prompt.content, /call plan_exit/)
})

test("removes planner review tools from V2 subagents", async () => {
  const host = runtime()
  await plannerPlugin.setup(host.context)
  const event = {
    sessionID: "ses_subagent",
    agent: "general",
    system: [],
    tools: {
      edit_plan: {},
      planner_config: {},
      plan_exit: {},
      submit_plan: {},
      read: {},
    },
  }

  await host.hooks.session.context(event)

  assert.deepEqual(event.tools, { read: {} })
  assert.deepEqual(event.system, [])
})

test("V2 tools return the structural tool result shape", async () => {
  const host = runtime()
  await plannerPlugin.setup(host.context)
  const config = await host.tools.find((tool) => tool.name === "planner_config").execute(
    {},
    { sessionID: "ses_v2" },
  )

  assert.equal(typeof config, "object")
  assert.match(config.content, /Plugin API: V2/)
  assert.match(config.content, /\/tmp\/planner-project\/\.opencode\/plans\/ses_v2\.md/)
})
