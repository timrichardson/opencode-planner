import path from "path"

const agent = "plan"
const root = ".opencode/plans"

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

function mode(input = {}) {
  const planExit = hasPlanExit()
  const base = {
    mode: "primary",
    color: "info",
    description: "Researches the codebase and writes execution plans without editing source files.",
    prompt: [
      "Use this agent when the user wants a design, implementation plan, or scoped investigation before coding.",
      "Stay in planning mode: inspect the codebase, ask targeted questions when needed, and write a concise execution plan before implementation.",
      "Default plan path: .opencode/plans/<session-id>.md.",
      "Prefer the task tool with the explore and general subagents for deeper research.",
      reviewInstruction(".opencode/plans/<session-id>.md"),
      ...(planExit
        ? [
            "After approval, if the user or Plannotator says something like 'Proceed with implementation', call plan_exit to hand off back to implementation mode.",
          ]
        : []),
    ].join("\n\n"),
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
      submit_plan: "allow",
      ...(planExit ? { plan_exit: "allow" } : {}),
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
    prompt: [base.prompt, input?.prompt].filter(Boolean).join("\n\n"),
    permission: merge(base.permission, input?.permission),
  }
}

export default async function plannerPlugin() {
  const seen = new Set()

  return {
    async config(cfg) {
      cfg.agent ??= {}
      cfg.agent[agent] = mode(cfg.agent[agent])
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
