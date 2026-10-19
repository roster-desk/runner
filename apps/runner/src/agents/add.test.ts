import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { addTemplate, runAgentsAdd, templateIds } from "./add.js";

describe("agents add", () => {
  it("adds each template to the catalog the phone receives", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-210-"));
    expect(templateIds().sort()).toEqual(["daily-report", "file-tidy", "repo-helper"]);
    for (const id of templateIds()) {
      const added = addTemplate(dir, id, "~/work");
      expect(added.ok).toBe(true);
      if (added.ok) expect(added.catalog.some((agent) => agent.id === id)).toBe(true);
    }
    expect(fs.existsSync(path.join(dir, "agents", "daily-report", "agent.py"))).toBe(true);
    expect(addTemplate(dir, "repo-helper", "~/work").message).toBe("이미 있는 에이전트예요");
  });

  it("accepts a template flag without a prompt", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-210-flag-"));
    const added = await runAgentsAdd(["--template", "file-tidy", "--cwd", "~/Downloads"], dir, async () => {
      throw new Error("should not ask");
    });
    expect(added.ok).toBe(true);
    expect(added.message).toContain("파일 정리");
  });
});
