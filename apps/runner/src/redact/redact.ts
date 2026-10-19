import { createHash } from "node:crypto";

const MASK = "«가림:API 키»";

const PATTERNS = [
  "-----BEGIN [A-Z ]*PRIVATE KEY-----",
  "sk-ant-[A-Za-z0-9_-]+",
  "sk-[A-Za-z0-9_-]{20,}",
  "AKIA[0-9A-Z]{16}",
  "ghp_[A-Za-z0-9]{36}",
  "xox[baprs]-[A-Za-z0-9-]+",
  "eyJ[A-Za-z0-9_-]+\\.eyJ[A-Za-z0-9_-]+\\.[A-Za-z0-9_-]+",
  "password\\s*[:=]\\s*\\S+",
];

export function inputHash(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function redactText(text: string, env: NodeJS.ProcessEnv = {}) {
  const patterned = PATTERNS.reduce((current, pattern) => current.replace(new RegExp(pattern, "g"), MASK), text);
  return secretValues(env).reduce((current, value) => current.split(value).join(MASK), patterned);
}

export function previewOf(raw: string, env: NodeJS.ProcessEnv = {}) {
  return { inputHash: inputHash(raw), preview: redactText(raw, env) };
}

function secretValues(env: NodeJS.ProcessEnv) {
  return Object.entries(env)
    .filter(([name, value]) => /KEY|TOKEN|SECRET|PASSWORD/i.test(name) && (value?.length ?? 0) >= 8)
    .map(([, value]) => value ?? "")
    .sort((a, b) => b.length - a.length);
}
