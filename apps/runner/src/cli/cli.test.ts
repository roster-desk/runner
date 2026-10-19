import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { parseArgs } from "./args.js";
import { DEFAULT_HUB, healthUrl, isOlder, resolveHubUrl, updateNotice } from "./hub.js";
import { confirmOverwrite, listAgents, recentLogs, showPolicy } from "./local.js";

describe("runner cli", () => {
  it("defaults to the production hub and accepts --hub", () => {
    expect(resolveHubUrl(undefined, {})).toBe(DEFAULT_HUB);
    expect(parseArgs(["start", "--hub", "ws://localhost:3100/runner", "--ui"]).hub).toBe("ws://localhost:3100/runner");
    expect(parseArgs(["start", "--ui"]).ui).toBe(true);
    expect(healthUrl(DEFAULT_HUB)).toBe("https://roster-desk-hub.fly.dev/health");
  });

  it("notices when this build is older than the hub", async () => {
    expect(isOlder("0.1.0", "0.2.0")).toBe(true);
    expect(isOlder("0.1.0", "0.1.0")).toBe(false);
    const fetchImpl = async () => new Response(JSON.stringify({ minRunnerVersion: "0.2.0" }), { status: 200 });
    expect(await updateNotice(DEFAULT_HUB, "0.1.0", fetchImpl)).toContain("업데이트가 필요해요");
  });

  it("lists agents, policy, and logs from the data dir", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-401-"));
    expect(listAgents(dir)).toContain("파일이 없어요");
    expect(showPolicy(dir)).toBe("policy.yaml이 없어요");
    fs.mkdirSync(path.join(dir, "logs"));
    fs.writeFileSync(path.join(dir, "logs", "runner.log"), "ready\n");
    expect(recentLogs(dir)).toBe("ready");
    expect(await confirmOverwrite(true, false, async () => "n")).toBe(false);
    expect(await confirmOverwrite(true, true, async () => "n")).toBe(true);
  });
});
