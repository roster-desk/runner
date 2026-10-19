import fs from "node:fs";
import path from "node:path";
import { readRoster } from "../config/load.js";

export function listAgents(dir: string) {
  const roster = readRoster(dir);
  if (!roster.ok) return roster.errors.join("\n");
  if (!roster.catalog.length) return "에이전트가 없어요. roster-desk agents add";
  return roster.catalog.map((agent) => `${agent.id}\t${agent.name}`).join("\n");
}

export function showPolicy(dir: string) {
  const file = path.join(dir, "policy.yaml");
  if (!fs.existsSync(file)) return "policy.yaml이 없어요";
  return fs.readFileSync(file, "utf8");
}

export function recentLogs(dir: string) {
  const folder = path.join(dir, "logs");
  if (!fs.existsSync(folder)) return "로그가 없어요";
  const latest = fs.readdirSync(folder).filter((name) => name.endsWith(".log")).sort().at(-1);
  if (!latest) return "로그가 없어요";
  const lines = fs.readFileSync(path.join(folder, latest), "utf8").trim().split("\n");
  return lines.slice(-80).join("\n");
}

export async function confirmOverwrite(hasId: boolean, yes: boolean, ask: (prompt: string) => Promise<string>) {
  if (!hasId || yes) return true;
  const answer = (await ask("이미 등록된 PC예요. 다시 페어링하면 기존 연결을 덮어써요. 계속할까요? (y/n) ")).trim();
  return answer === "y";
}
