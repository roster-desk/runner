import nacl from "tweetnacl";
import { describe, expect, it } from "vitest";
import { fromB64, open, seal, toB64 } from "./e2e.js";

const party = () => {
  const keys = nacl.box.keyPair();
  return { pub: toB64(keys.publicKey), secret: keys.secretKey };
};

describe("e2e envelope", () => {
  it("round-trips base64url for every length", () => {
    for (let n = 0; n < 40; n += 1) {
      const bytes = nacl.randomBytes(n);
      expect(Array.from(fromB64(toB64(bytes)))).toEqual(Array.from(bytes));
    }
  });

  it("lets each recipient read, hides the text from everyone else", () => {
    const pc = party();
    const phoneA = party();
    const phoneB = party();
    const stranger = party();
    const sealed = seal("비밀 리포트 내용", [{ id: "a", pub: phoneA.pub }, { id: "b", pub: phoneB.pub }], pc)!;
    expect(sealed).not.toContain("리포트");
    expect(open(sealed, { id: "a", secret: phoneA.secret })).toBe("비밀 리포트 내용");
    expect(open(sealed, { id: "b", secret: phoneB.secret }, [pc.pub])).toBe("비밀 리포트 내용");
    expect(open(sealed, { id: "a", secret: stranger.secret })).toBeNull();
    expect(open(sealed, { id: "c", secret: phoneA.secret })).toBeNull();
    expect(open(sealed, { id: "a", secret: phoneA.secret }, [stranger.pub])).toBeNull();
  });

  it("rejects a tampered body", () => {
    const pc = party();
    const phone = party();
    const envelope = JSON.parse(seal("x", [{ id: "a", pub: phone.pub }], pc)!);
    envelope.c = toB64(nacl.randomBytes(fromB64(envelope.c).length));
    expect(open(JSON.stringify(envelope), { id: "a", secret: phone.secret })).toBeNull();
  });
});
