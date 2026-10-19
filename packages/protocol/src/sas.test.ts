import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { computeSas, formatSas, sha256 } from "./sas.js";

function bytes(fill: number) {
  return new Uint8Array(32).fill(fill);
}

const vectors = [
  {
    sessionId: "00000000-0000-4000-8000-000000000001",
    runnerSignPub: bytes(1),
    runnerBoxPub: bytes(2),
    phoneBoxPub: bytes(3),
    sas: "017632",
  },
  {
    sessionId: "11111111-1111-4111-8111-111111111111",
    runnerSignPub: bytes(0x11),
    runnerBoxPub: bytes(0x22),
    phoneBoxPub: bytes(0x33),
    sas: "196263",
  },
  {
    sessionId: "ffffffff-ffff-4fff-bfff-ffffffffffff",
    runnerSignPub: bytes(0xaa),
    runnerBoxPub: bytes(0xbb),
    phoneBoxPub: bytes(0xcc),
    sas: "284454",
  },
];

describe("SAS vectors", () => {
  it("matches the three frozen codes", () => {
    for (const vector of vectors) {
      expect(computeSas(vector)).toBe(vector.sas);
      expect(formatSas(vector.sas)).toBe(`${vector.sas.slice(0, 3)} ${vector.sas.slice(3)}`);
    }
  });

  it("hashes the same bytes as Node crypto", () => {
    const samples = [new Uint8Array(), new TextEncoder().encode("abc"), bytes(7)];
    for (const sample of samples) {
      const ours = Buffer.from(sha256(sample));
      const node = createHash("sha256").update(sample).digest();
      expect(ours.equals(node)).toBe(true);
    }
  });
});
