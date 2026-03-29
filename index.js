import { createHash } from "node:crypto"
import { spawn } from "node:child_process"
import { readFile } from "node:fs/promises"
import path from "path"
import process from "node:process"

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
    `Otherwise, call edit_plan to open the markdown plan in the configured external editor for review. If edit_plan fails, tell the user the plan is ready at ${target} and ask for review in chat.`,
    `If edit_plan reports that the user changed the plan externally, treat that as review feedback on the plan, summarize the changes, and continue planning from the revised plan.`,
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
          "If the plan changes after submit_plan, stay in planner mode, update the plan as needed, and call submit_plan again before plan_exit.",
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
      "If the plan changed after submit_plan, do not call plan_exit yet. Revise as needed and call submit_plan again first.",
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
      edit_plan: "deny",
      plan_exit: "deny",
      submit_plan: "deny",
    }),
  }
}

function editorCommand() {
  return process.env.PLAN_VISUAL?.trim() || process.env.VISUAL?.trim() || process.env.EDITOR?.trim() || ""
}

function hashPlan(content) {
  return createHash("sha256").update(content).digest("hex")
}

async function readIfExists(target) {
  try {
    return await readFile(target, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null
    }

    throw error
  }
}

function formatPlanBlock(title, content, fallback) {
  return [title, "````markdown", content && content.trim() ? content : fallback, "````"].join("\n")
}

async function snapshotSubmittedPlan(sessionID, args) {
  const defaultTarget = file(sessionID)
  const currentFile = await readIfExists(defaultTarget)
  if (currentFile !== null) {
    return {
      target: defaultTarget,
      hash: hashPlan(currentFile),
    }
  }

  const submitted = typeof args?.plan === "string" ? args.plan : ""
  if (!submitted.trim()) return null

  if (path.isAbsolute(submitted)) {
    const content = await readIfExists(submitted)
    if (content !== null) {
      return {
        target: submitted,
        hash: hashPlan(content),
      }
    }
  }

  return {
    target: null,
    hash: hashPlan(submitted),
  }
}

async function planChangedSinceSubmit(sessionID, submitted) {
  if (!submitted) return false

  const target = submitted.target ?? file(sessionID)
  const current = await readIfExists(target)
  if (current === null) {
    return submitted.target !== null
  }

  return hashPlan(current) !== submitted.hash
}

function runEditor(target) {
  const editor = editorCommand()
  if (!editor) {
    throw new Error(
      "None of `PLAN_VISUAL`, `VISUAL`, or `EDITOR` is set, so edit_plan cannot open the plan. Configure a blocking editor command such as `code --wait`, or a terminal launcher that opens your editor in a separate window and waits.",
    )
  }

  const shell = process.env.SHELL ?? "sh"

  return new Promise((resolve, reject) => {
    const child = spawn(shell, ["-lc", `${editor} "$1"`, "opencode-editor", target], {
      stdio: ["ignore", "ignore", "pipe"],
      env: process.env,
    })

    let stderr = ""
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString()
    })

    child.on("error", reject)
    child.on("exit", (code) => {
      if (code === 0) {
        resolve()
        return
      }

      const detail = stderr.trim()
      const suffix = detail ? `: ${detail}` : ""
      reject(
        new Error(
          `The external editor command exited with status ${code}${suffix}. Configure PLAN_VISUAL, VISUAL, or EDITOR to launch a separate process that waits until editing is complete.`,
        ),
      )
    })
  })
}

async function editPlan(sessionID) {
  const target = file(sessionID ?? "<session-id>")
  const before = await readIfExists(target)
  await runEditor(target)

  let after = ""

  try {
    after = await readFile(target, "utf8")
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      throw new Error(`The plan file \`${target}\` does not exist yet. Finish writing the plan first.`)
    }

    throw error
  }

  if (before === after) {
    return [
      "The plan was reopened in your external editor. No changes were made.",
      `File: ${target}`,
      "",
      formatPlanBlock("## Current plan", after, `The plan file \`${target}\` is empty.`),
    ].join("\n")
  }

  return [
    "The user edited the plan externally.",
    `File: ${target}`,
    "",
    "Treat these external edits as review feedback on the plan. Summarize what changed, continue planning from the updated plan, and if this plan was already reviewed with submit_plan, submit the revised plan again before plan_exit.",
    "",
    formatPlanBlock("## Previous plan", before, "_(The plan file did not exist before editing.)_"),
    "",
    formatPlanBlock("## Updated plan", after, `The plan file \`${target}\` is empty.`),
  ].join("\n")
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
      edit_plan: "allow",
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
  const submittedPlans = new Map()

  return {
    tool: {
      plan_prompt: {
        description: "Reveal the planner plugin prompt basis",
        args: {},
        async execute(_, context) {
          return promptDisclosure(context.sessionID ? file(context.sessionID) : defaultPlanTarget)
        },
      },
      edit_plan: {
        description: "Open the current plan in the configured external editor",
        args: {},
        async execute(_, context) {
          return editPlan(context.sessionID)
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
    async "tool.execute.before"(input) {
      if (input.tool !== "plan_exit") return

      const submitted = submittedPlans.get(input.sessionID)
      if (!(await planChangedSinceSubmit(input.sessionID, submitted))) return

      throw new Error(
        "The plan has changed since the last submit_plan review. Stay in planner mode, update the plan as needed, and call submit_plan again before plan_exit.",
      )
    },
    async "tool.execute.after"(input) {
      if (input.tool !== "submit_plan") return

      const snapshot = await snapshotSubmittedPlan(input.sessionID, input.args)
      if (snapshot) submittedPlans.set(input.sessionID, snapshot)
    },
    async "experimental.chat.system.transform"(input, output) {
      if (!input.sessionID || !seen.has(input.sessionID)) return
      output.system.push(note(input.sessionID))
    },
  }
}
