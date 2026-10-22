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
  options: { cwd?: string; command?: string[]; url?: string };
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

const AGENT_ID = /^[a-z0-9-]{2,40}$/;

/** 노코드 도구(n8n, Make 등) 웹훅을 에이전트로 붙인다 (RD-211 http 어댑터). */
export function addHttpAgent(dir: string, input: { id: string; name: string; url: string; description?: string }) {
  if (!AGENT_ID.test(input.id)) return { ok: false as const, message: "id는 소문자, 숫자, 하이픈으로 2~40자여야 해요" };
  if (!input.name.trim() || input.name.length > 40) return { ok: false as const, message: "이름을 1~40자로 적어 주세요" };
  if (!/^https?:\/\/\S+$/.test(input.url)) return { ok: false as const, message: "웹훅 주소는 http(s)://로 시작해야 해요" };
  fs.mkdirSync(dir, { recursive: true });
  ensurePolicy(dir);
  const agents = readAgents(path.join(dir, "agents.yaml"));
  if (agents.some((agent) => agent.id === input.id)) return { ok: false as const, message: "이미 있는 에이전트예요" };
  agents.push({
    id: input.id,
    name: input.name.trim(),
    description: (input.description ?? "웹훅으로 연결한 에이전트").slice(0, 200),
    adapter: "http",
    capabilities: [],
    options: { url: input.url } as Entry["options"],
    policy: "dev-default",
  });
  fs.writeFileSync(path.join(dir, "agents.yaml"), stringify({ version: 1, agents }));
  const roster = readRoster(dir);
  if (!roster.ok) return { ok: false as const, message: roster.errors[0] ?? "설정을 읽지 못했어요" };
  return { ok: true as const, message: `${input.name}을 추가했어요. 폰 목록에 곧 나타나요.` };
}

export function templateList() {
  return templateIds().flatMap((id) => {
    const entry = loadEntry(id);
    return entry ? [{ id, name: entry.name, description: entry.description, defaultCwd: String(entry.options.cwd ?? "") }] : [];
  });
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
