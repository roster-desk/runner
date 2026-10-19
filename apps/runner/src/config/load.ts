import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { devEchoEnabled } from "../adapters/install.js";
import { credentialDir } from "../credential-store.js";
import type { AdapterAgent } from "../adapters/registry.js";
import { AgentFile, PolicyFile } from "./schema.js";
import { checkSchema, issueLine } from "./yaml.js";

export type CatalogAgent = { id: string; name: string; description: string; capabilities: string[] };

export type Roster =
  | { ok: true; agents: AdapterAgent[]; catalog: CatalogAgent[] }
  | { ok: false; errors: string[] };

export function readRoster(dir = credentialDir()): Roster {
  const agentsPath = path.join(dir, "agents.yaml");
  const policyPath = path.join(dir, "policy.yaml");
  const missing = missingFile(agentsPath, "agents.yaml").concat(missingFile(policyPath, "policy.yaml"));
  if (missing.length) return { ok: false, errors: missing };
  const agents = checkSchema("agents.yaml", fs.readFileSync(agentsPath, "utf8"), AgentFile);
  const policy = checkSchema("policy.yaml", fs.readFileSync(policyPath, "utf8"), PolicyFile);
  const errors = [...(agents.ok ? [] : agents.errors), ...(policy.ok ? [] : policy.errors)];
  if (!agents.ok || !policy.ok) return { ok: false, errors };
  const unknown = unknownPolicies(agents, policy.data);
  if (unknown.length) return { ok: false, errors: unknown };
  const rows = agents.data.agents as AdapterAgent[];
  const listed = rows.filter((agent) => devEchoEnabled() || agent.adapter !== "echo");
  return { ok: true, agents: listed, catalog: listed.map(toCatalog) };
}

function missingFile(file: string, name: string) {
  return fs.existsSync(file) ? [] : [`${name}:1 파일이 없어요`];
}

function unknownPolicies(
  agents: { data: AgentFile; doc: import("yaml").Document; lines: import("yaml").LineCounter },
  policy: PolicyFile,
) {
  return agents.data.agents.flatMap((agent, index) => {
    if (policy.profiles[agent.policy]) return [];
    const line = issueLine(agents.doc, ["agents", index, "policy"], agents.lines);
    return [`agents.yaml:${line} policy '${agent.policy}'가 policy.yaml에 없어요`];
  });
}

function toCatalog(agent: AdapterAgent): CatalogAgent {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    capabilities: agent.capabilities,
  };
}

export function catalogFrame(catalog: CatalogAgent[]) {
  return { v: 2 as const, id: randomUUID(), type: "catalog.sync" as const, ts: Date.now(), data: { agents: catalog } };
}
