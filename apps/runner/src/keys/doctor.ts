import { ensureRunnerKeys, type EnsureInput } from "./keystore.js";
import { sdkCredentialLine } from "../adapters/claude-agent-sdk.js";

export function keyStoreLine(where: "keychain" | "file") {
  return where === "keychain" ? "키 저장: 키체인" : "키 저장: 파일(경고)";
}

export async function doctorReport(input: EnsureInput = {}) {
  const stored = await ensureRunnerKeys(input);
  return keyStoreLine(stored.where);
}

export async function runDoctor() {
  console.log(await doctorReport());
  console.log(sdkCredentialLine());
}
