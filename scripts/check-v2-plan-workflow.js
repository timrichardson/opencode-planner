import assert from "node:assert/strict"
import { once } from "node:events"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import path from "node:path"
import process from "node:process"
import { spawn } from "node:child_process"
import { fileURLToPath, pathToFileURL } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const temporaryRoot = process.env.OPENCODE_PLANNER_TMPDIR ?? "/tmp/opencode"
await mkdir(temporaryRoot, { recursive: true })
const sandbox = await mkdtemp(path.join(temporaryRoot, "opencode-planner-v2-"))
const initialPlan = "# Initial plan\n\n- first step\n"
const revisedPlan = "# Revised plan\n\n- safer step\n"
const marker = path.join(sandbox, "workflow-result.txt")
const editor = path.join(sandbox, "edit-plan.js")
const harness = path.join(sandbox, "workflow-plugin.js")
const password = "opencode-planner-integration"

await writeFile(editor, `import { writeFile } from "node:fs/promises"\nawait writeFile(process.argv[2], ${JSON.stringify(revisedPlan)})\n`)
await writeFile(
  harness,
  `import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { editPlan, planTarget } from ${JSON.stringify(pathToFileURL(path.join(root, "index.js")).href)}

export default {
  id: "opencode-planner.workflow-test",
  async setup(ctx) {
    await ctx.command.transform((commands) => {
      commands.add({
        name: "planner-workflow-test",
        async execute(input) {
          const session = await ctx.session.get({ sessionID: input.sessionID })
          const context = { directory: session.location.directory, worktree: session.location.directory }
          const target = planTarget(input.sessionID, context)
          await mkdir(path.dirname(target), { recursive: true })
          await writeFile(target, ${JSON.stringify(initialPlan)})
          const output = await editPlan(input.sessionID, context)
          const plan = await readFile(target, "utf8")
          if (plan !== ${JSON.stringify(revisedPlan)}) throw new Error("The editor did not revise the plan")
          if (!output.includes("The user edited the plan externally.")) throw new Error("editPlan did not report the revision")
          if (!output.includes("# Initial plan") || !output.includes("# Revised plan")) throw new Error("editPlan did not return both plan versions")
          await writeFile(${JSON.stringify(marker)}, output)
        },
      })
    })
  },
}
`,
)
await writeFile(
  path.join(sandbox, "opencode.json"),
  `${JSON.stringify(
    {
      plugins: [
        pathToFileURL(path.join(root, "server.js")).href,
        pathToFileURL(harness).href,
      ],
    },
    null,
    2,
  )}\n`,
)

const server = spawn(process.env.OPENCODE_PLANNER_OPENCODE2_BIN ?? "opencode2", ["serve", "--hostname", "127.0.0.1", "--port", "0"], {
  cwd: sandbox,
  stdio: ["ignore", "pipe", "pipe"],
  env: {
    ...process.env,
    HOME: path.join(sandbox, "home"),
    XDG_CONFIG_HOME: path.join(sandbox, "config"),
    XDG_DATA_HOME: path.join(sandbox, "data"),
    XDG_STATE_HOME: path.join(sandbox, "state"),
    XDG_CACHE_HOME: path.join(sandbox, "cache"),
    OPENCODE_CONFIG: path.join(sandbox, "opencode.json"),
    OPENCODE_PASSWORD: password,
    PLAN_VISUAL: `${process.execPath} ${editor}`,
  },
})
let stderr = ""
server.stderr.setEncoding("utf8")
server.stderr.on("data", (chunk) => {
  stderr += chunk
})

try {
  const url = await serverURL(server)
  const session = await jsonRequest(url, "/api/session", {
    method: "POST",
    headers: requestHeaders(password),
    body: "{}",
  })
  const response = await fetch(`${url}/api/session/${session.data.id}/command`, {
    method: "POST",
    headers: requestHeaders(password),
    body: JSON.stringify({ command: "planner-workflow-test", text: "" }),
  })
  if (!response.ok) throw new Error(`OpenCode V2 command failed with HTTP ${response.status}: ${await response.text()}\n${stderr}`)

  assert.equal(await readFile(path.join(sandbox, ".opencode/plans", `${session.data.id}.md`), "utf8"), revisedPlan)
  assert.match(await readFile(marker, "utf8"), /The user edited the plan externally/)
  console.log("OpenCode V2 created and edited a planner file")
} finally {
  if (server.exitCode === null) {
    const exited = once(server, "exit")
    server.kill()
    await exited
  }
  await rm(sandbox, { recursive: true, force: true })
}

function serverURL(child) {
  child.stdout.setEncoding("utf8")
  return new Promise((resolve, reject) => {
    let output = ""
    const timeout = setTimeout(() => reject(new Error(`OpenCode V2 did not start within 15 seconds\n${output}\n${stderr}`)), 15_000)
    child.stdout.on("data", (chunk) => {
      output += chunk
      const match = output.match(/server listening on (http:\/\/\S+)/)
      if (!match) return
      clearTimeout(timeout)
      resolve(match[1])
    })
    child.once("error", (error) => {
      clearTimeout(timeout)
      reject(error)
    })
    child.once("exit", (code) => {
      clearTimeout(timeout)
      reject(new Error(`OpenCode V2 exited before listening with status ${code}\n${output}\n${stderr}`))
    })
  })
}

async function jsonRequest(url, pathname, init) {
  const response = await fetch(`${url}${pathname}`, init)
  if (!response.ok) throw new Error(`OpenCode V2 request failed with HTTP ${response.status}: ${await response.text()}\n${stderr}`)
  return response.json()
}

function requestHeaders(value) {
  return {
    authorization: `Basic ${Buffer.from(`opencode:${value}`).toString("base64")}`,
    "content-type": "application/json",
  }
}
