import test from "node:test"
import assert from "node:assert/strict"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import plannerPlugin from "../server.js"

function runtime(directory = "/tmp/planner-project") {
  const agents = new Map()
  const commands = new Map()
  const tools = []
  const hooks = { session: {}, tool: {} }
  const prompts = []
  let sessionAgent = "build"
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
    prompts,
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
        list: async () => ({ data: [...commands.values()] }),
        transform: async (callback) => callback({
          add: (command) => commands.set(command.name, command),
        }),
      },
      tool: {
        transform: async (callback) => callback({ add: (tool) => tools.push(tool) }),
        hook: async (name, callback) => {
          hooks.tool[name] = callback
        },
      },
      session: {
        get: async () => ({ agent: sessionAgent, location: { directory } }),
        switchAgent: async (input) => {
          sessionAgent = input.agent
        },
        prompt: async (input) => {
          prompts.push(input)
        },
        hook: async (name, callback) => {
          hooks.session[name] = callback
        },
      },
    },
  }
}

test("exports a V2 server plugin definition", () => {
  assert.equal(plannerPlugin.id, "opencode-planner")
  assert.equal(typeof plannerPlugin.server, "function")
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
  assert.equal(host.commands.get("edit-plan").description, "Reopen the current plan in your editor")
  assert.equal(typeof host.commands.get("edit-plan").execute, "function")
  assert.equal(host.commands.get("planner-config").description, "Show planner configuration details")
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
  const custom = async () => {}
  host.commands.set("edit-plan", { name: "edit-plan", description: "Custom command", execute: custom })

  await plannerPlugin.setup(host.context)

  assert.equal(host.agents.get("plan").system, "Custom planner prompt")
  assert.equal(host.commands.get("edit-plan").description, "Custom command")
  assert.equal(host.commands.get("edit-plan").execute, custom)
})

test("V2 commands switch to the plan agent and submit their prompt", async () => {
  const host = runtime()
  await plannerPlugin.setup(host.context)

  await host.commands.get("edit-plan").execute({
    sessionID: "ses_command",
    prompt: { text: "Please reopen it", files: undefined, agents: undefined, skills: undefined },
    delivery: "steer",
  })

  assert.equal(host.prompts.length, 1)
  assert.equal(host.prompts[0].sessionID, "ses_command")
  assert.equal(host.prompts[0].delivery, "steer")
  assert.match(host.prompts[0].text, /calling the edit_plan tool/i)
  assert.match(host.prompts[0].text, /Please reopen it/)
  assert.equal(Object.hasOwn(host.prompts[0], "files"), false)
  assert.equal(Object.hasOwn(host.prompts[0], "agents"), false)
  assert.equal(Object.hasOwn(host.prompts[0], "skills"), false)

  const attachments = {
    files: [{ uri: "file:///tmp/plan.md" }],
    agents: [{ name: "explore" }],
    skills: [{ id: "review" }],
  }
  await host.commands.get("planner-config").execute({
    sessionID: "ses_command",
    prompt: { text: "", ...attachments },
    delivery: "queue",
  })

  assert.deepEqual(host.prompts[1].files, attachments.files)
  assert.deepEqual(host.prompts[1].agents, attachments.agents)
  assert.deepEqual(host.prompts[1].skills, attachments.skills)
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

test("requires renewed V2 review before transitioning after plan changes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "opencode-planner-v2-"))
  const target = path.join(directory, ".opencode/plans/ses_transition.md")

  try {
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, "# Submitted plan\n\n- step one\n")

    const host = runtime(directory)
    await plannerPlugin.setup(host.context)
    const submit = () => host.hooks.tool["execute.after"]({
      tool: "submit_plan",
      sessionID: "ses_transition",
      agent: "plan",
      messageID: "msg_transition",
      id: "call_submit",
      status: "completed",
      input: { plan: "/tmp/ignored.md" },
      result: { content: "approved" },
    })
    const exit = () => host.hooks.tool["execute.before"]({
      tool: "plan_exit",
      sessionID: "ses_transition",
      agent: "plan",
      messageID: "msg_transition",
      id: "call_exit",
      input: {},
    })

    await submit()
    await assert.doesNotReject(exit())

    await writeFile(target, "# Revised plan\n\n- safer transition\n")
    await assert.rejects(exit(), /changed since the last submit_plan review/i)

    await submit()
    await assert.doesNotReject(exit())
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("removes planner tools and reminders after transitioning out of the V2 plan agent", async () => {
  const host = runtime()
  await plannerPlugin.setup(host.context)

  for (const agent of ["build", "general", "explore"]) {
    const event = {
      sessionID: "ses_transition",
      agent,
      system: [],
      tools: {
        edit_plan: {},
        planner_config: {},
        plan_prompt: {},
        plan_exit: {},
        submit_plan: {},
        read: {},
      },
    }

    await host.hooks.session.context(event)

    assert.deepEqual(event.tools, { read: {} })
    assert.deepEqual(event.system, [])
  }
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
