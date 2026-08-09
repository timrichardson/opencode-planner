import {
  agentPrompt,
  defaultPlanTarget,
  editPlan,
  editorConfig,
  formatSetting,
  note,
  planChangedSinceSubmit,
  planTarget,
  promptDisclosure,
  snapshotSubmittedPlan,
} from "./index.js"

const id = "opencode-planner"
const agent = "plan"
const emptyInput = {
  type: "object",
  properties: {},
  additionalProperties: false,
}
const editPlanCommand = {
  description: "Reopen the current plan in your editor",
  agent,
  template:
    "Reopen the current markdown plan in the configured external editor by calling the edit_plan tool. If the tool reports that the user changed the plan externally, treat those edits as review feedback, summarize what changed, and continue planning from the updated plan.",
}
const plannerConfigCommand = {
  description: "Show planner configuration details",
  agent,
  template:
    "Call the planner_config tool for the current session and return its output so the user can inspect planner tool availability, editor resolution, and relevant runtime flags.",
}

const plannerPermissions = [
  { action: "*", resource: "*", effect: "deny" },
  { action: "read", resource: "*", effect: "allow" },
  { action: "read", resource: "*.env", effect: "ask" },
  { action: "read", resource: "*.env.*", effect: "ask" },
  { action: "read", resource: "*.env.example", effect: "allow" },
  { action: "glob", resource: "*", effect: "allow" },
  { action: "grep", resource: "*", effect: "allow" },
  { action: "question", resource: "*", effect: "allow" },
  { action: "subagent", resource: "explore", effect: "allow" },
  { action: "subagent", resource: "general", effect: "allow" },
  { action: "webfetch", resource: "*", effect: "allow" },
  { action: "websearch", resource: "*", effect: "allow" },
  { action: "execute", resource: "*", effect: "allow" },
  { action: "edit_plan", resource: "*", effect: "allow" },
  { action: "planner_config", resource: "*", effect: "allow" },
  { action: "plan_prompt", resource: "*", effect: "allow" },
  { action: "submit_plan", resource: "*", effect: "allow" },
  { action: "plan_exit", resource: "*", effect: "allow" },
  { action: "edit", resource: ".opencode/plans/*.md", effect: "allow" },
  { action: "edit", resource: "plans/*.md", effect: "allow" },
  { action: "edit", resource: "specs/*.md", effect: "allow" },
  { action: "edit", resource: "**/*.plan.md", effect: "allow" },
  { action: "edit", resource: "**/*.spec.md", effect: "allow" },
]

async function setup(ctx) {
  const submittedPlans = new Map()
  const availableTools = new Map()

  await ctx.agent.transform((agents) => {
    const configured = agents.get(agent)
    agents.update(agent, (item) => {
      item.mode = "primary"
      item.color = "info"
      item.description = "Researches the codebase and writes execution plans without editing source files."
      if (!configured?.system) item.system = agentPrompt(defaultPlanTarget, false)
      item.permissions.push(...plannerPermissions)
    })

    for (const name of ["general", "explore"]) {
      agents.update(name, (item) => {
        item.permissions.push(
          { action: "edit_plan", resource: "*", effect: "deny" },
          { action: "planner_config", resource: "*", effect: "deny" },
          { action: "plan_exit", resource: "*", effect: "deny" },
          { action: "submit_plan", resource: "*", effect: "deny" },
        )
      })
    }
  })

  await ctx.command.transform((commands) => {
    if (!commands.get("edit-plan")) {
      commands.update("edit-plan", (command) => Object.assign(command, editPlanCommand))
    }
    if (!commands.get("planner-config")) {
      commands.update("planner-config", (command) => Object.assign(command, plannerConfigCommand))
    }
  })

  await ctx.tool.transform((tools) => {
    tools.add({
      name: "plan_prompt",
      options: { codemode: false },
      description: "Reveal the planner plugin prompt basis",
      input: emptyInput,
      execute: async (_, context) => ({
        content: promptDisclosure(
          context.sessionID ? planTarget(context.sessionID) : defaultPlanTarget,
          availableTools.get(context.sessionID)?.has("plan_exit") ?? false,
        ),
      }),
    })
    tools.add({
      name: "edit_plan",
      options: { codemode: false },
      description: "Open the current plan in the configured external editor",
      input: emptyInput,
      execute: async (_, context) => ({
        content: await editPlan(context.sessionID, await sessionContext(ctx, context.sessionID)),
      }),
    })
    tools.add({
      name: "planner_config",
      options: { codemode: false },
      description: "Show planner configuration details for the current session",
      input: emptyInput,
      execute: async (_, context) => ({
        content: await plannerConfig(ctx, context.sessionID, availableTools.get(context.sessionID) ?? new Set()),
      }),
    })
  })

  await ctx.session.hook("context", (event) => {
    if (event.agent === "general" || event.agent === "explore") {
      delete event.tools.edit_plan
      delete event.tools.planner_config
      delete event.tools.plan_exit
      delete event.tools.submit_plan
      return
    }
    if (event.agent !== agent) return
    availableTools.set(event.sessionID, new Set(Object.keys(event.tools)))
    event.system.push({ type: "text", text: note(event.sessionID, Boolean(event.tools.plan_exit)) })
  })

  await ctx.tool.hook("execute.before", async (event) => {
    if (event.tool !== "plan_exit") return
    if (!(await planChangedSinceSubmit(event.sessionID, submittedPlans.get(event.sessionID), await sessionContext(ctx, event.sessionID)))) return
    throw new Error(
      "The plan has changed since the last submit_plan review. Stay in planner mode, update the plan as needed, and call submit_plan again before plan_exit.",
    )
  })

  await ctx.tool.hook("execute.after", async (event) => {
    if (event.tool !== "submit_plan" || event.status !== "completed") return
    const snapshot = await snapshotSubmittedPlan(
      event.sessionID,
      event.input,
      await sessionContext(ctx, event.sessionID),
    )
    if (snapshot) submittedPlans.set(event.sessionID, snapshot)
  })
}

async function sessionContext(ctx, sessionID) {
  const session = await ctx.session.get({ sessionID })
  return { directory: session.location.directory, worktree: session.location.directory }
}

async function plannerConfig(ctx, sessionID, tools) {
  const context = await sessionContext(ctx, sessionID)
  const editor = editorConfig()
  const target = planTarget(sessionID ?? "<session-id>", context)

  return [
    "# opencode-planner configuration",
    "## Planner files",
    `- Current session plan path: \`${target}\``,
    `- Default plan path pattern: \`${defaultPlanTarget}\``,
    "",
    "## Planner tools",
    ...["plan_prompt", "edit_plan", "planner_config", "submit_plan", "plan_exit"].map(
      (name) => `- ${name}: ${tools.has(name) ? "available in the current V2 session" : "not available in the current V2 session"}`,
    ),
    "",
    "## Editor resolution",
    "- Precedence: `PLAN_VISUAL` -> `VISUAL` -> `EDITOR`",
    ...editor.variables.map((entry) => `- ${entry.key}: ${formatSetting(entry.value)}`),
    `- Selected source: ${editor.selected ? `\`${editor.selected.key}\`` : "none"}`,
    `- Selected command: ${formatSetting(editor.command)}`,
    "",
    "## Runtime",
    `- OpenCode: \`${ctx.app.version}\` (${ctx.app.channel})`,
    "- Plugin API: V2",
  ].join("\n")
}

export const plugin = { id, setup }
export default plugin
