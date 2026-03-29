import path from "path"

const agent = "plan"
const root = ".opencode/plans"
const defaultPlanTarget = file("<session-id>")

function truthy(key) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function hasPlanExit() {
  const experimentalPlanMode = truthy("OPENCODE_EXPERIMENTAL") || truthy("OPENCODE_EXPERIMENTAL_PLAN_MODE")
  const client = process.env.OPENCODE_CLIENT ?? "cli"
  return experimentalPlanMode && client === "cli"
}

function file(id) {
  return path.posix.join(root, `${id}.md`)
}

function reviewInstruction(target) {
  return [
    `When the plan is complete, if the submit_plan tool is available, use it to submit the plan for review.`,
    `Otherwise, tell the user the plan is ready at ${target} and ask for review in chat.`,
  ].join(" ")
}

function agentPrompt(target = defaultPlanTarget) {
  const planExit = hasPlanExit()

  return [
    "Use this agent when the user wants a design, implementation plan, or scoped investigation before coding.",
    "Stay in planning mode: inspect the codebase, ask targeted questions when needed, and write a concise execution plan before implementation.",
    `Default plan path: ${target}.`,
    "Prefer the task tool with the explore and general subagents for deeper research.",
    reviewInstruction(target),
    ...(planExit
      ? [
          "After approval, if the user or Plannotator says something like 'Proceed with implementation', call plan_exit to hand off back to implementation mode.",
        ]
      : []),
  ].join("\n\n")
}

function promptDisclosure(target = defaultPlanTarget) {
  return [
    "# opencode-planner prompt basis",
    "This tool shows the prompt text and planner reminder supplied by the opencode-planner plugin itself.",
    "The final runtime prompt can still differ if the user overrides `agent.plan.prompt`, another plugin edits `agent.plan`, or runtime tool availability changes.",
    "## Base prompt",
    agentPrompt(defaultPlanTarget),
    "## Planner reminder",
    "This reminder is injected by the plugin at runtime to keep the `plan` agent in planner mode and enforce the review handoff workflow. It is plugin-controlled and is not customized through `agent.plan.prompt`.",
    note(target.replace(`${root}/`, "").replace(/\.md$/, "")),
    "## How to customize it",
    "Only the Base prompt above is replaced by `agent.plan.prompt`. Add this to `opencode.json` to replace that base prompt:",
    [
      "```json",
      "{",
      '  "agent": {',
      '    "plan": {',
      '      "prompt": "You are my planning agent. Focus on migration risk, rollout steps, and testing strategy."',
      "    }",
      "  }",
      "}",
      "```",
    ].join("\n"),
    "Ask the `plan` agent to call `plan_prompt` when you want a fresh copy of the plugin prompt as a starting point.",
  ].join("\n\n")
}

function note(id) {
  const out = [
    "<system-reminder>",
    "Planner mode is active.",
    "You must not edit source files, run bash, change config, or make commits.",
    "You may only use read-only tools, ask clarifying questions, delegate exploration or design with the task tool, and edit allowed markdown plan files.",
    `Write the plan to ${file(id)} or another allowed *.plan.md/*.spec.md file.`,
    reviewInstruction(file(id)),
    "</system-reminder>",
  ]

  if (hasPlanExit()) {
    out.splice(
      out.length - 1,
      0,
      "If the user or Plannotator then says something like 'Proceed with implementation', call the plan_exit tool to leave planner mode.",
    )
  }

  return out.join("\n")
}

function partID() {
  return `prt_${crypto.randomUUID()}`
}

function rules(input) {
  if (!input) return {}
  if (typeof input === "string") return { "*": input }
  return input
}

function merge(a, b) {
  const left = rules(a)
  const right = rules(b)
  const out = { ...left, ...right }

  for (const key of Object.keys(left)) {
    const x = left[key]
    const y = right[key]
    if (!x || !y || typeof x !== "object" || typeof y !== "object") continue
    if (Array.isArray(x) || Array.isArray(y)) continue
    out[key] = { ...x, ...y }
  }

  return out
}

function restrictPlannerSubagent(input = {}) {
  return {
    ...input,
    permission: merge(input?.permission, {
      plan_exit: "deny",
      submit_plan: "deny",
    }),
  }
}

function mode(input = {}) {
  const base = {
    mode: "primary",
    color: "info",
    description: "Researches the codebase and writes execution plans without editing source files.",
    prompt: agentPrompt(),
    permission: {
      "*": "deny",
      read: {
        "*": "allow",
        "*.env": "ask",
        "*.env.*": "ask",
        "*.env.example": "allow",
      },
      glob: "allow",
      grep: "allow",
      question: "allow",
      task: {
        "*": "deny",
        explore: "allow",
        general: "allow",
      },
      webfetch: "allow",
      websearch: "allow",
      codesearch: "allow",
      batch: "allow",
      plan_prompt: "allow",
      submit_plan: "allow",
      ...(hasPlanExit() ? { plan_exit: "allow" } : {}),
      edit: {
        "*": "deny",
        [path.posix.join(root, "*.md")]: "allow",
        "plans/*.md": "allow",
        "specs/*.md": "allow",
        "**/*.plan.md": "allow",
        "**/*.spec.md": "allow",
      },
      bash: "deny",
      skill: "deny",
      todowrite: "deny",
    },
  }

  return {
    ...base,
    ...input,
    prompt: input && Object.hasOwn(input, "prompt") ? input.prompt : base.prompt,
    permission: merge(base.permission, input?.permission),
  }
}

export default async function plannerPlugin() {
  const seen = new Set()

  return {
    tool: {
      plan_prompt: {
        description: "Reveal the planner plugin prompt basis",
        args: {},
        async execute(_, context) {
          return promptDisclosure(context.sessionID ? file(context.sessionID) : defaultPlanTarget)
        },
      },
    },
    async config(cfg) {
      cfg.agent ??= {}
      cfg.agent[agent] = mode(cfg.agent[agent])
      cfg.agent.general = restrictPlannerSubagent(cfg.agent.general)
      cfg.agent.explore = restrictPlannerSubagent(cfg.agent.explore)
    },
    async "chat.message"(input, output) {
      if (input.agent !== agent) {
        seen.delete(input.sessionID)
        return
      }

      seen.add(input.sessionID)
      output.parts.push({
        id: partID(),
        messageID: output.message.id,
        sessionID: output.message.sessionID,
        type: "text",
        text: note(input.sessionID),
        synthetic: true,
      })
    },
    async "experimental.chat.system.transform"(input, output) {
      if (!input.sessionID || !seen.has(input.sessionID)) return
      output.system.push(note(input.sessionID))
    },
  }
}
