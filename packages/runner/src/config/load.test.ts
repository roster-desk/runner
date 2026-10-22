import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { readRoster } from "./load.js";
import { watchRoster } from "./watch.js";

const agents = `version: 1
agents:
  - id: repo-helper
    name: 레포 도우미
    description: 버그를 고쳐요
    adapter: command
    capabilities: [코드 수정]
    options:
      cwd: ~/dev/my-repo
    policy: dev-default
`;

const policy = `version: 1
profiles:
  dev-default:
    default: ask
    rules:
      - match: { tool: "Read|Glob" }
        action: allow
        risk: low
`;

function writePair(dir: string, agentText = agents, policyText = policy) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "agents.yaml"), agentText);
  fs.writeFileSync(path.join(dir, "policy.yaml"), policyText);
}

describe("roster config", () => {
  it("reports the line of a bad agent id", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-201-"));
    const broken = agents.replace("id: repo-helper", "id: Bad_ID");
    writePair(dir, broken);
    const roster = readRoster(dir);
    expect(roster.ok).toBe(false);
    if (roster.ok) return;
    expect(roster.errors[0]).toBe("agents.yaml:3 id는 소문자, 숫자, 하이픈으로 2~40자여야 해요");
  });

  it("reports a policy name that is not in policy.yaml", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-201-"));
    writePair(dir, agents.replace("policy: dev-default", "policy: missing"));
    const roster = readRoster(dir);
    expect(roster.ok).toBe(false);
    if (roster.ok) return;
    expect(roster.errors[0]).toContain("agents.yaml:");
    expect(roster.errors[0]).toContain("policy 'missing'");
  });

  it("hides echo agents unless RUNNER_DEV=1", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-202-"));
    writePair(dir, agents.replace("adapter: command", "adapter: echo"));
    const hidden = readRoster(dir);
    expect(hidden.ok).toBe(true);
    if (!hidden.ok) return;
    expect(hidden.catalog).toEqual([]);
    process.env.RUNNER_DEV = "1";
    try {
      const shown = readRoster(dir);
      expect(shown.ok).toBe(true);
      if (!shown.ok) return;
      expect(shown.catalog.map((item) => item.id)).toEqual(["repo-helper"]);
    } finally {
      delete process.env.RUNNER_DEV;
    }
  });

  it("reloads the catalog when agents.yaml changes", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-201-"));
    writePair(dir);
    const seen: number[] = [];
    const stop = watchRoster(dir, (frame) => seen.push(frame.data.agents.length));
    await new Promise((resolve) => setTimeout(resolve, 50));
    const next = agents.replace(
      "policy: dev-default",
      `policy: dev-default
  - id: daily-report
    name: 일일 리포트
    adapter: command
    policy: dev-default`,
    );
    fs.writeFileSync(path.join(dir, "agents.yaml"), next);
    const start = Date.now();
    let nudged = false;
    while (!seen.includes(2) && Date.now() - start < 3000) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      if (seen.at(-1) === 1 && !nudged) {
        nudged = true;
        fs.writeFileSync(path.join(dir, "agents.yaml"), next);
      }
    }
    stop();
    expect(seen.at(-1)).toBe(2);
  });
});
