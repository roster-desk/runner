import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { clearLegacyCredential, fileCredentialStore } from "./credential-store.js";

describe("fileCredentialStore", () => {
  let dir: string;

  afterEach(() => {
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  it("saves and clears a credential without logging the secret", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-cred-"));
    const store = fileCredentialStore(dir);
    await store.save({
      credentialId: "cred-1",
      secret: "super-secret",
      pairId: "pair-1",
      deviceId: "device-1",
      hubWsUrl: "ws://localhost:3100/runner",
      version: 1,
    });
    const loaded = await store.load();
    expect(loaded?.credentialId).toBe("cred-1");
    // Windows에는 POSIX 권한 비트가 없다.
    if (process.platform !== "win32")
      expect(fs.statSync(path.join(dir, "credential.json")).mode & 0o777).toBe(0o600);
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("deletes the legacy credential file after v2 pairing", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "runner-cred-"));
    const store = fileCredentialStore(dir);
    await store.save({
      credentialId: "cred-1",
      secret: "super-secret",
      pairId: "pair-1",
      deviceId: "device-1",
      hubWsUrl: "ws://localhost:3100/runner",
      version: 1,
    });
    clearLegacyCredential(dir);
    expect(fs.existsSync(path.join(dir, "credential.json"))).toBe(false);
  });
});
