import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { doctorReport } from "./doctor.js";
import { generateRunnerKeys } from "./generate.js";
import { deleteRunnerKeys, ensureRunnerKeys, samePublicKey } from "./keystore.js";
import type { SecretStore } from "./secret-store.js";

function memoryStore(): SecretStore {
  let value: string | null = null;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
    delete: () => {
      value = null;
    },
  };
}

describe("runner keys", () => {
  let dir: string;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("creates a signing key and a box key", () => {
    const keys = generateRunnerKeys();
    expect(keys.signPublicKey).toHaveLength(32);
    expect(keys.signSecretKey).toHaveLength(64);
    expect(keys.boxPublicKey).toHaveLength(32);
    expect(keys.boxSecretKey).toHaveLength(32);
  });

  it("saves to the keychain mock and loads the same public key", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-keys-"));
    const keychain = memoryStore();
    const first = await ensureRunnerKeys({ dir, keychain });
    const second = await ensureRunnerKeys({ dir, keychain });
    expect(first.where).toBe("keychain");
    expect(samePublicKey(first, second)).toBe(true);
    expect(await doctorReport({ dir, keychain })).toBe("키 저장: 키체인");
  });

  it("falls back to a 0600 file when the keychain rejects the write", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-keys-"));
    const keychain: SecretStore = {
      get: () => null,
      set: () => {
        throw new Error("locked");
      },
      delete: () => undefined,
    };
    const stored = await ensureRunnerKeys({ dir, keychain });
    expect(stored.where).toBe("file");
    const mode = fs.statSync(path.join(dir, "runner-keys.json")).mode & 0o777;
    expect(mode).toBe(0o600);
    expect(await doctorReport({ dir, keychain: null })).toBe("키 저장: 파일(경고)");
  });

  it("deletes the saved key", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-keys-"));
    const keychain = memoryStore();
    const first = await ensureRunnerKeys({ dir, keychain });
    await deleteRunnerKeys({ dir, keychain });
    const second = await ensureRunnerKeys({ dir, keychain });
    expect(samePublicKey(first, second)).toBe(false);
  });
});
