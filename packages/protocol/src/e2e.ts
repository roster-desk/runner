import nacl from "tweetnacl";

/**
 * RD-601 종단 간 암호화 봉투 (encVersion 1).
 * 본문은 임의 대칭 키로 secretbox, 그 키를 받는 쪽마다 box(X25519 + XSalsa20-Poly1305)로 감싼다.
 * Hub는 봉투(JSON)만 저장·전달한다. 받는 쪽 ID: 폰은 deviceId, PC는 "runner:<runnerId>".
 */
export const ENC_VERSION = 1;

export type Recipient = { id: string; pub: string };
export type Envelope = { v: 1; from: string; n: string; c: string; to: Record<string, { n: string; k: string }> };

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

export function toB64(bytes: Uint8Array) {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += ALPHABET[(n >> 18) & 63]! + ALPHABET[(n >> 12) & 63]!;
    if (i + 1 < bytes.length) out += ALPHABET[(n >> 6) & 63]!;
    if (i + 2 < bytes.length) out += ALPHABET[n & 63]!;
  }
  return out;
}

export function fromB64(text: string) {
  const clean = text.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const char of clean) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error("bad_base64");
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/** 받는 쪽마다 대칭 키를 감싼 봉투 JSON. 받는 쪽이 없으면 null (보낼 상대가 없음). */
export function seal(text: string, recipients: Recipient[], sender: { pub: string; secret: Uint8Array }): string | null {
  if (recipients.length === 0) return null;
  const key = nacl.randomBytes(nacl.secretbox.keyLength);
  const nonce = nacl.randomBytes(nacl.secretbox.nonceLength);
  const body = nacl.secretbox(encoder.encode(text), nonce, key);
  const to: Envelope["to"] = {};
  for (const recipient of recipients) {
    const wrapNonce = nacl.randomBytes(nacl.box.nonceLength);
    to[recipient.id] = { n: toB64(wrapNonce), k: toB64(nacl.box(key, wrapNonce, fromB64(recipient.pub), sender.secret)) };
  }
  const envelope: Envelope = { v: 1, from: sender.pub, n: toB64(nonce), c: toB64(body), to };
  return JSON.stringify(envelope);
}

/** 내 몫을 풀어 평문을 돌려준다. 내 몫이 없거나 위조면 null. trusted가 있으면 그 공개 키들이 보낸 것만 연다. */
export function open(sealed: string, me: { id: string; secret: Uint8Array }, trusted?: string[]): string | null {
  let envelope: Envelope;
  try {
    envelope = JSON.parse(sealed) as Envelope;
  } catch {
    return null;
  }
  if (envelope?.v !== 1 || typeof envelope.from !== "string") return null;
  if (trusted && !trusted.includes(envelope.from)) return null;
  const mine = envelope.to?.[me.id];
  if (!mine) return null;
  try {
    const key = nacl.box.open(fromB64(mine.k), fromB64(mine.n), fromB64(envelope.from), me.secret);
    if (!key) return null;
    const body = nacl.secretbox.open(fromB64(envelope.c), fromB64(envelope.n), key);
    return body ? decoder.decode(body) : null;
  } catch {
    return null;
  }
}

export function runnerRecipientId(runnerId: string) {
  return `runner:${runnerId}`;
}
