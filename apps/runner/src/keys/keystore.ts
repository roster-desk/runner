import { credentialDir } from "../credential-store.js";
import { decodeKeys, encodeKeys } from "./codec.js";
import { generateRunnerKeys, type RunnerKeys } from "./generate.js";
import { fileSecretStore, openKeychain, type SecretStore } from "./secret-store.js";

export type KeyLocation = "keychain" | "file";

export type StoredRunnerKeys = RunnerKeys & { where: KeyLocation };

export type EnsureInput = {
  dir?: string;
  keychain?: SecretStore | null;
};

function sameKey(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  return left.every((byte, index) => byte === right[index]);
}

export function samePublicKey(left: RunnerKeys, right: RunnerKeys) {
  return sameKey(left.signPublicKey, right.signPublicKey);
}

async function chosenKeychain(input: EnsureInput) {
  if (input.keychain !== undefined) return input.keychain;
  if (process.env.RUNNER_KEY_STORE === "file") return null;
  return openKeychain();
}

function fromFile(dir: string): StoredRunnerKeys {
  const file = fileSecretStore(dir);
  const existing = decodeKeys(file.get());
  if (existing) return { ...existing, where: "file" };
  const fresh = generateRunnerKeys();
  file.set(encodeKeys(fresh));
  console.warn("[runner] 키체인 대신 권한 0600 파일에 키를 저장했습니다.");
  return { ...fresh, where: "file" };
}

export async function ensureRunnerKeys(input: EnsureInput = {}): Promise<StoredRunnerKeys> {
  const dir = input.dir ?? credentialDir();
  const keychain = await chosenKeychain(input);
  if (!keychain) return fromFile(dir);
  const existing = decodeKeys(keychain.get());
  if (existing) return { ...existing, where: "keychain" };
  const fresh = generateRunnerKeys();
  try {
    keychain.set(encodeKeys(fresh));
    return { ...fresh, where: "keychain" };
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    console.warn(`[runner] 키체인 저장에 실패했습니다. ${message}`);
    return fromFile(dir);
  }
}

export async function deleteRunnerKeys(input: EnsureInput = {}) {
  const dir = input.dir ?? credentialDir();
  const keychain = await chosenKeychain(input);
  keychain?.delete();
  fileSecretStore(dir).delete();
}
