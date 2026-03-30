import { execFileSync } from "node:child_process"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const localPlugin = `file://${path.join(root, "index.js")}`

function runJSON(args) {
  try {
    const output = execFileSync("opencode", args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim()

    return JSON.parse(output)
  } catch (error) {
    const stdout = error.stdout?.toString?.() ?? ""
    const stderr = error.stderr?.toString?.() ?? ""
    const detail = [stdout, stderr].filter(Boolean).join("\n")
    throw new Error(`Failed to run: opencode ${args.join(" ")}\n${detail}`.trim())
  }
}

function hasAllowedPermission(permission, entries = []) {
  return entries.some((entry) => entry.permission === permission && entry.action === "allow")
}

function line(label, value) {
  console.log(`${label.padEnd(32)} ${value}`)
}

const config = runJSON(["debug", "config"])
const plan = runJSON(["debug", "agent", "plan"])

const plugins = config.plugin ?? []
const commands = config.command ?? {}
const permissions = plan.permission ?? []
const tools = plan.tools ?? {}
const prompt = plan.prompt ?? ""

const editPlanCommandConfigured = Boolean(commands["edit-plan"])
const plannerConfigCommandConfigured = Boolean(commands["planner-config"])
const planPromptAllowed = hasAllowedPermission("plan_prompt", permissions)
const editPlanAllowed = hasAllowedPermission("edit_plan", permissions)
const plannerConfigAllowed = hasAllowedPermission("planner_config", permissions)
const planExitAllowed = hasAllowedPermission("plan_exit", permissions)
const submitPlanAllowed = hasAllowedPermission("submit_plan", permissions)
const planPromptTool = Boolean(tools.plan_prompt)
const editPlanTool = Boolean(tools.edit_plan)
const plannerConfigTool = Boolean(tools.planner_config)
const planExitTool = Boolean(tools.plan_exit)
const submitPlanTool = Boolean(tools.submit_plan)
const usingLocalPlugin = plugins.includes(localPlugin)
const promptMentionsPlanExit = prompt.includes("plan_exit")

console.log("OpenCode plan runtime check")
console.log("")
line("Repo plugin loaded", usingLocalPlugin ? "yes" : "no")
line("/edit-plan command", editPlanCommandConfigured ? "yes" : "no")
line("/planner-config command", plannerConfigCommandConfigured ? "yes" : "no")
line("plan_prompt allowed", planPromptAllowed ? "yes" : "no")
line("plan_prompt tool", planPromptTool ? "yes" : "no")
line("edit_plan allowed", editPlanAllowed ? "yes" : "no")
line("edit_plan tool", editPlanTool ? "yes" : "no")
line("planner_config allowed", plannerConfigAllowed ? "yes" : "no")
line("planner_config tool", plannerConfigTool ? "yes" : "no")
line("submit_plan allowed", submitPlanAllowed ? "yes" : "no")
line("plan_exit allowed", planExitAllowed ? "yes" : "no")
line("submit_plan tool", submitPlanTool ? "yes" : "no")
line("plan_exit tool", planExitTool ? "yes" : "no")
line("Prompt mentions plan_exit", promptMentionsPlanExit ? "yes" : "no")
line(
  "OPENCODE_EXPERIMENTAL_PLAN_MODE",
  process.env.OPENCODE_EXPERIMENTAL_PLAN_MODE || "<unset>",
)
line("OPENCODE_CLIENT", process.env.OPENCODE_CLIENT || "<unset>")

console.log("\nActive plugins:")
for (const plugin of plugins) {
  console.log(`- ${plugin}`)
}

console.log("\nAssessment:")
if (!usingLocalPlugin) {
  console.log(`- OpenCode is not using the local repo plugin at ${localPlugin}.`)
}
if (!editPlanCommandConfigured) {
  console.log("- /edit-plan is not configured in the resolved command list.")
}
if (!plannerConfigCommandConfigured) {
  console.log("- /planner-config is not configured in the resolved command list.")
}
if (!planPromptTool) {
  console.log("- plan_prompt is not registered as a runtime tool.")
}
if (!editPlanTool) {
  console.log("- edit_plan is not registered as a runtime tool.")
}
if (!plannerConfigTool) {
  console.log("- planner_config is not registered as a runtime tool.")
}
if (!submitPlanTool) {
  console.log("- submit_plan is not registered as a runtime tool.")
}
if (planExitAllowed && !planExitTool) {
  console.log(
    "- plan_exit is permitted by the agent config but is not registered as a callable runtime tool.",
  )
  console.log(
    "- Upstream OpenCode only registers plan_exit when OPENCODE_EXPERIMENTAL_PLAN_MODE is enabled and OPENCODE_CLIENT is 'cli'.",
  )
} else if (!planExitAllowed) {
  console.log("- plan_exit is not allowed by the plan agent config.")
} else {
  console.log("- plan_exit is both allowed and registered.")
}
