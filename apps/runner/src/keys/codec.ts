import type { RunnerKeys } from "./generate.js";

type Stored = {
  signPublicKey: string;
  signSecretKey: string;
  boxPublicKey: string;
  boxSecretKey: string;
};

function encodeBytes(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

function decodeBytes(text: string) {
  return new Uint8Array(Buffer.from(text, "base64url"));
}

export function encodeKeys(keys: RunnerKeys) {
  return JSON.stringify({
    signPublicKey: encodeBytes(keys.signPublicKey),
    signSecretKey: encodeBytes(keys.signSecretKey),
    boxPublicKey: encodeBytes(keys.boxPublicKey),
    boxSecretKey: encodeBytes(keys.boxSecretKey),
  });
}

export function decodeKeys(raw: string | null): RunnerKeys | null {
  if (!raw) return null;
  const parsed = JSON.parse(raw) as Stored;
  if (!parsed.signSecretKey || !parsed.boxSecretKey) return null;
  return {
    signPublicKey: decodeBytes(parsed.signPublicKey),
    signSecretKey: decodeBytes(parsed.signSecretKey),
    boxPublicKey: decodeBytes(parsed.boxPublicKey),
    boxSecretKey: decodeBytes(parsed.boxSecretKey),
  };
}
