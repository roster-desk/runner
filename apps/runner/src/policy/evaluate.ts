import type { PolicyFile } from "../config/schema.js";

export type PolicyAction = "allow" | "ask" | "deny";
export type PolicyRisk = "low" | "medium" | "high";
export type PolicyHit = { action: PolicyAction; risk: PolicyRisk };

type Rule = PolicyFile["profiles"][string]["rules"][number];

export function evaluatePolicy(
  policy: PolicyFile,
  input: { agentId: string; profile: string; toolName: string; inputText: string },
): PolicyHit {
  const profile = policy.profiles[input.profile];
  if (!profile) return { action: "deny", risk: "high" };
  return (
    firstDeny(profile.rules, input) ??
    grantedHit(policy, input) ??
    firstRule(profile.rules, input) ?? { action: profile.default, risk: "medium" }
  );
}

function firstDeny(rules: Rule[], input: { toolName: string; inputText: string }) {
  return rules.filter((rule) => rule.action === "deny").map((rule) => hitIfMatch(rule, input)).find(Boolean);
}

function grantedHit(policy: PolicyFile, input: { agentId: string; toolName: string }) {
  const granted = policy.granted.some((item) => item.agent === input.agentId && item.tool === input.toolName);
  return granted ? { action: "allow" as const, risk: "low" as const } : undefined;
}

function firstRule(rules: Rule[], input: { toolName: string; inputText: string }) {
  return rules.map((rule) => hitIfMatch(rule, input)).find(Boolean);
}

function hitIfMatch(rule: Rule, input: { toolName: string; inputText: string }): PolicyHit | undefined {
  if (!toolMatches(rule.match.tool, input.toolName)) return undefined;
  if (!inputMatches(rule.match.inputContains, input.inputText)) return undefined;
  return { action: rule.action, risk: rule.risk ?? "medium" };
}

function toolMatches(pattern: string, toolName: string) {
  return pattern.split("|").some((part) => glob(part).test(toolName));
}

function inputMatches(needles: string[] | undefined, inputText: string) {
  if (!needles?.length) return true;
  return needles.some((needle) => searchGlob(needle).test(inputText));
}

function glob(pattern: string) {
  return new RegExp(`^${escapeGlob(pattern.trim())}$`);
}

function searchGlob(pattern: string) {
  return new RegExp(escapeGlob(pattern));
}

function escapeGlob(pattern: string) {
  return pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
}
