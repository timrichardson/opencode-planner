import path from "path"

const agent = "plan"
const root = ".opencode/plans"

function file(id) {
  return path.posix.join(root, `${id}.md`)
}

function note(id) {
  return [
    "<system-reminder>",
    "Planner mode is active.",
    "You must not edit source files, run bash, change config, or make commits.",
    "You may only use read-only tools, ask clarifying questions, delegate exploration or design with the task tool, and edit allowed markdown plan files.",
    `Write the plan to ${file(id)} or another allowed *.plan.md/*.spec.md file.`,
    "When the plan is complete, call the submit_plan tool to open Plannotator for review.",
    "</system-reminder>",
  ].join("\n")
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
  const base = {
    mode: "primary",
    color: "info",
    description: "Researches the codebase and writes execution plans without editing source files.",
    prompt: [
      "Use this agent when the user wants a design, implementation plan, or scoped investigation before coding.",
      "Stay in planning mode: inspect the codebase, ask targeted questions when needed, and write a concise execution plan before implementation.",
      "Default plan path: .opencode/plans/<session-id>.md.",
      "Prefer the task tool with the explore and general subagents for deeper research.",
      "Do not stop after writing the plan; call submit_plan to submit the plan for review.",
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
