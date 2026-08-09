import { execFileSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const sandbox = await mkdtemp(path.join(tmpdir(), "opencode-planner-v1-"))

try {
  await Promise.all(["config", "data", "state", "cache"].map((directory) => mkdir(path.join(sandbox, directory))))
  await writeFile(
    path.join(sandbox, "opencode.json"),
    `${JSON.stringify({ plugin: [`file://${root}`] }, null, 2)}\n`,
  )

  const env = {
    ...process.env,
    HOME: sandbox,
    XDG_CONFIG_HOME: path.join(sandbox, "config"),
    XDG_DATA_HOME: path.join(sandbox, "data"),
    XDG_STATE_HOME: path.join(sandbox, "state"),
    XDG_CACHE_HOME: path.join(sandbox, "cache"),
    OPENCODE_CONFIG: path.join(sandbox, "opencode.json"),
  }
  const run = (args) => JSON.parse(execFileSync(process.env.OPENCODE_PLANNER_OPENCODE_BIN ?? "opencode", args, {
    cwd: root,
    encoding: "utf8",
    env,
  }))
  const config = run(["debug", "config"])
  const plan = run(["debug", "agent", "plan"])

  for (const command of ["edit-plan", "planner-config"]) {
    if (!config.command?.[command]) throw new Error(`OpenCode V1 did not register /${command}`)
  }
  for (const tool of ["edit_plan", "planner_config", "plan_prompt"]) {
    if (!plan.tools?.[tool]) throw new Error(`OpenCode V1 did not register ${tool}`)
  }

  console.log("OpenCode V1 registered planner commands and tools")
} finally {
  await rm(sandbox, { recursive: true, force: true })
}
