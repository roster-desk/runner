import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import nacl from "tweetnacl";
import { credentialDir } from "../credential-store.js";
import type { RunnerPubs } from "./confirm.js";
import { RUNNER_VERSION } from "../cli/hub.js";

function frame(type: string, data: Record<string, unknown>) {
  return { v: 2, id: randomUUID(), type, ts: Date.now(), data };
}

function b64(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function idFile() {
  return path.join(credentialDir(), "runner-id.txt");
}

export function loadRunnerId() {
  const file = idFile();
  if (!fs.existsSync(file)) return null;
  const id = fs.readFileSync(file, "utf8").trim();
  return id || null;
}

export function saveRunnerId(id: string) {
  const file = idFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, id, { mode: 0o600 });
}

export function clearRunnerId() {
  const file = idFile();
  if (fs.existsSync(file)) fs.unlinkSync(file);
}

export function offerFrame(keys: RunnerPubs) {
  return frame("pair.offer", {
    signPub: b64(keys.signPublicKey),
    boxPub: b64(keys.boxPublicKey),
    deviceName: "Roster Desk",
    os: process.platform,
  });
}

export function helloFrame(runnerId: string) {
  return frame("hello", {
    runnerVersion: RUNNER_VERSION,
    os: process.platform,
    deviceName: "Roster Desk",
    runnerId,
  });
}

export function proofFrame(runnerId: string, nonce: string, secret: Uint8Array) {
  const message = new TextEncoder().encode(`roster-desk/auth/v1|${runnerId}|${nonce}`);
  return frame("auth.proof", { runnerId, nonce, sig: b64(nacl.sign.detached(message, secret)) });
}
