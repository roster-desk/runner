import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readPolicy, savePhoneGrant } from "./grant.js";

const grant = { agent: "repo-helper", tool: "Edit", addedAt: "2026-10-21T00:00:00Z", from: "phone" as const };

function dirWith(text: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-grant-"));
  fs.writeFileSync(path.join(dir, "policy.yaml"), text);
  return dir;
}

describe("phone grant", () => {
  it("appends once and keeps comments", () => {
    const dir = dirWith("# 내 규칙\nversion: 1\nprofiles:\n  p:\n    default: ask\n");
    expect(savePhoneGrant(grant, dir)).toBe(true);
    expect(savePhoneGrant(grant, dir)).toBe(false);
    const text = fs.readFileSync(path.join(dir, "policy.yaml"), "utf8");
    expect(text).toContain("# 내 규칙");
    expect(readPolicy(dir).granted).toEqual([grant]);
  });
});
