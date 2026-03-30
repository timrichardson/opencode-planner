import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import process from "node:process"
import { spawn } from "node:child_process"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, "..")
const localPlanner = `file://${path.join(root, "index.js")}`
const globalConfigDir = path.join(os.homedir(), ".config", "opencode")
const globalConfigPaths = [
  path.join(globalConfigDir, "opencode.jsonc"),
  path.join(globalConfigDir, "opencode.json"),
]

function usage() {
  console.log(`Usage: node scripts/run-opencode-sandbox.js [--without-plannotator] [opencode args...]

Examples:
  npm run opencode:no-plannotator
  npm run opencode:no-plannotator -- debug config
  OPENCODE_EXPERIMENTAL_PLAN_MODE=1 OPENCODE_CLIENT=cli npm run opencode:no-plannotator -- debug agent plan`)
}

function normalizePlugin(entry) {
  return Array.isArray(entry) ? entry[0] : entry
}

function parseLooseJSON(text) {
  const source = text.replace(/^\uFEFF/, "")
  let out = ""
  let inString = false
  let quote = ""
  let escaped = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    const next = source[i + 1]

    if (inString) {
      out += char
      if (escaped) {
        escaped = false
        continue
      }
      if (char === "\\") {
        escaped = true
        continue
      }
      if (char === quote) {
        inString = false
        quote = ""
      }
      continue
    }

    if (char === '"') {
      inString = true
      quote = char
      out += char
      continue
    }

    if (char === "/" && next === "/") {
      i += 2
      while (i < source.length && source[i] !== "\n") i += 1
      if (i < source.length) out += "\n"
      continue
    }

    if (char === "/" && next === "*") {
      i += 2
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1
      i += 1
      continue
    }

    out += char
  }

  return JSON.parse(out.replace(/,\s*([}\]])/g, "$1"))
}

function keepWithoutPlannotator(entry) {
  const id = normalizePlugin(entry)
  return id !== "@plannotator/opencode@latest" && id !== "@plannotator/opencode"
}

async function readGlobalConfig() {
  for (const file of globalConfigPaths) {
    try {
      return parseLooseJSON(await fs.readFile(file, "utf8"))
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
        continue
      }
      throw error
    }
  }

  throw new Error(
    `No OpenCode config found. Checked: ${globalConfigPaths.map((file) => `\`${file}\``).join(", ")}`,
  )
}

const rawArgs = process.argv.slice(2)
if (rawArgs.includes("-h") || rawArgs.includes("--help")) {
  usage()
  process.exit(0)
}

const stripPlannotator = rawArgs.includes("--without-plannotator")
const opencodeArgs = rawArgs.filter((arg) => arg !== "--without-plannotator")

const baseConfig = await readGlobalConfig()
const plugin = (baseConfig.plugin ?? []).filter((entry) => !stripPlannotator || keepWithoutPlannotator(entry))

const filtered = plugin.filter((entry) => normalizePlugin(entry) !== localPlanner)
filtered.push(localPlanner)

const sandboxConfig = {
  ...baseConfig,
  plugin: filtered,
}

const sandboxRoot = await fs.mkdtemp(path.join(os.tmpdir(), "opencode-planner-"))
const configDir = path.join(sandboxRoot, ".config", "opencode")
const dataDir = path.join(sandboxRoot, ".local", "share")
const stateDir = path.join(sandboxRoot, ".local", "state")
const cacheDir = path.join(sandboxRoot, ".cache")

await fs.mkdir(configDir, { recursive: true })
await fs.mkdir(dataDir, { recursive: true })
await fs.mkdir(stateDir, { recursive: true })
await fs.mkdir(cacheDir, { recursive: true })

const sandboxConfigPath = path.join(sandboxRoot, "opencode.sandbox.json")
await fs.writeFile(sandboxConfigPath, `${JSON.stringify(sandboxConfig, null, 2)}\n`)

console.log(`Sandbox root: ${sandboxRoot}`)
console.log(`Sandbox config: ${sandboxConfigPath}`)
console.log("Active plugins:")
for (const entry of filtered) {
  console.log(`- ${normalizePlugin(entry)}`)
}

const child = spawn("opencode", opencodeArgs, {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    HOME: sandboxRoot,
    XDG_CONFIG_HOME: path.join(sandboxRoot, ".config"),
    XDG_DATA_HOME: dataDir,
    XDG_STATE_HOME: stateDir,
    XDG_CACHE_HOME: cacheDir,
    OPENCODE_CONFIG: sandboxConfigPath,
  },
})

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 0)
})
