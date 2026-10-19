import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";
import { readRoster } from "../config/load.js";

const DEFAULT_POLICY = {
  version: 1,
  profiles: {
    "dev-default": {
      default: "ask",
      rules: [
        { match: { tool: "Read|Glob|Grep|read_file|list_*" }, action: "allow", risk: "low" },
        { match: { tool: "Edit|Write|write_file|move_file" }, action: "ask", risk: "medium" },
        { match: { tool: "Bash|shell|exec" }, action: "ask", risk: "high" },
      ],
    },
  },
  granted: [],
};

type Entry = {
  id: string;
  name: string;
  description: string;
  adapter: "echo" | "command" | "claude-agent-sdk" | "http";
  capabilities: string[];
  options: { cwd?: string; command?: string[] };
  policy: string;
};

const SCRIPTS: Record<string, string> = {
  "daily-report": "agent.py",
  "file-tidy": "agent.ts",
};

export function templateIds() {
  return fs.readdirSync(templateRoot()).filter((name) => fs.existsSync(path.join(templateRoot(), name, "entry.yaml")));
}

export function addTemplate(dir: string, templateId: string, cwd: string) {
  const entry = loadEntry(templateId);
  if (!entry) return { ok: false as const, message: "없는 템플릿이에요" };
  fs.mkdirSync(dir, { recursive: true });
  ensurePolicy(dir);
  const agents = readAgents(path.join(dir, "agents.yaml"));
  if (agents.some((agent) => agent.id === entry.id)) return { ok: false as const, message: "이미 있는 에이전트예요" };
  agents.push(withCwd(entry, dir, cwd));
  fs.writeFileSync(path.join(dir, "agents.yaml"), stringify({ version: 1, agents }));
  const roster = readRoster(dir);
  if (!roster.ok) return { ok: false as const, message: roster.errors[0] ?? "설정을 읽지 못했어요" };
  return { ok: true as const, message: `${entry.name}을 추가했어요. 폰 목록에 곧 나타나요.`, catalog: roster.catalog };
}

export async function runAgentsAdd(argv: string[], dir: string, ask: (prompt: string) => Promise<string>) {
  const templateId = flag(argv, "--template") || (await ask(menu()));
  const cwd = flag(argv, "--cwd") || (await ask("작업 폴더: "));
  return addTemplate(dir, templateId.trim(), cwd.trim());
}

function menu() {
  return `템플릿을 고르세요\n${templateIds().join("\n")}\n이름: `;
}

function loadEntry(templateId: string): Entry | null {
  const file = path.join(templateRoot(), templateId, "entry.yaml");
  if (!fs.existsSync(file)) return null;
  return parse(fs.readFileSync(file, "utf8")) as Entry;
}

function withCwd(entry: Entry, dir: string, cwd: string): Entry {
  const command = copyScript(entry.id, dir);
  return { ...entry, options: { ...entry.options, cwd, ...(command ? { command } : {}) } };
}

function copyScript(templateId: string, dir: string) {
  const script = SCRIPTS[templateId];
  if (!script) return null;
  const source = path.join(templateRoot(), templateId, script);
  const destDir = path.join(dir, "agents", templateId);
  fs.mkdirSync(destDir, { recursive: true });
  fs.copyFileSync(source, path.join(destDir, script));
  const runner = script.endsWith(".py") ? "python3" : "tsx";
  return [runner, path.join(destDir, script)];
}

function ensurePolicy(dir: string) {
  const file = path.join(dir, "policy.yaml");
  if (!fs.existsSync(file)) fs.writeFileSync(file, stringify(DEFAULT_POLICY));
}

function readAgents(file: string): Entry[] {
  if (!fs.existsSync(file)) return [];
  const parsed = parse(fs.readFileSync(file, "utf8")) as { agents?: Entry[] };
  return parsed.agents ?? [];
}

function templateRoot() {
  return packagedTemplates() ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/agent-kit/templates");
}

function packagedTemplates() {
  try {
    const entry = createRequire(import.meta.url).resolve("@rosterdesk/agent-kit");
    const root = packageRoot(path.dirname(entry));
    if (!root) return null;
    const templates = path.join(root, "templates");
    return fs.existsSync(templates) ? templates : null;
  } catch {
    return null;
  }
}

function packageRoot(start: string) {
  let dir = start;
  for (let step = 0; step < 4; step += 1) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath) && readName(pkgPath) === "@rosterdesk/agent-kit") return dir;
    dir = path.dirname(dir);
  }
  return null;
}

function readName(file: string) {
  const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as { name?: string };
  return parsed.name ?? "";
}

function flag(argv: string[], name: string) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] ?? "" : "";
}
