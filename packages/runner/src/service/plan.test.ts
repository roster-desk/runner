import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { installService, uninstallService } from "./install.js";
import { planService } from "./plan.js";

const home = () => fs.mkdtempSync(path.join(os.tmpdir(), "rd-402-"));

describe("service install", () => {
  it("writes a launch agent that starts on login", () => {
    const dir = home();
    const calls: string[] = [];
    const result = installService({
      platform: "darwin",
      home: dir,
      node: "/usr/bin/node",
      script: "/app/cli.js",
      uid: 501,
      exec: (cmd, args) => {
        calls.push(`${cmd} ${args.join(" ")}`);
        return { ok: true, message: "" };
      },
    });
    const body = fs.readFileSync(path.join(dir, "Library", "LaunchAgents", "com.rosterdesk.runner.plist"), "utf8");
    expect(result.ok).toBe(true);
    expect(body).toContain("<key>RunAtLoad</key><true/>");
    expect(body).toContain("/app/cli.js");
    expect(calls.some((line) => line.includes("bootstrap gui/501"))).toBe(true);
  });

  it("writes linux and windows login units", () => {
    const dir = home();
    const linux = planService({ platform: "linux", home: dir, node: "/usr/bin/node", script: "/app/cli.js", uid: 1000 });
    const windows = planService({ platform: "win32", home: dir, node: "C:\\node.exe", script: "C:\\cli.js", uid: 0 });
    expect("body" in linux && linux.body.includes("WantedBy=default.target")).toBe(true);
    expect("body" in windows && windows.body.includes("<LogonTrigger>")).toBe(true);
    expect(planService({ platform: "freebsd", home: dir, node: "n", script: "s", uid: 0 })).toEqual({
      message: "이 운영체제에서는 자동 시작을 지원하지 않아요.",
    });
  });

  it("removes the unit on uninstall", () => {
    const dir = home();
    const input = { platform: "linux" as const, home: dir, node: "/usr/bin/node", script: "/app/cli.js", uid: 1000, exec: () => ({ ok: true, message: "" }) };
    installService(input);
    const file = path.join(dir, ".config", "systemd", "user", "roster-desk-runner.service");
    expect(fs.existsSync(file)).toBe(true);
    expect(uninstallService(input).message).toBe("자동 시작을 지웠어요.");
    expect(fs.existsSync(file)).toBe(false);
  });
});
