import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { planService, type ServicePaths, type Step } from "./plan.js";

export type Exec = (cmd: string, args: string[]) => { ok: boolean; message: string };

type Input = Partial<ServicePaths> & { exec?: Exec };

export function installService(input: Input = {}) {
  return apply(input, "install", "로그인할 때 Runner가 켜져요.");
}

export function uninstallService(input: Input = {}) {
  return apply(input, "uninstall", "자동 시작을 지웠어요.");
}

function apply(input: Input, action: "install" | "uninstall", success: string) {
  const planned = planService(paths(input));
  if ("message" in planned) return { ok: false as const, message: planned.message };
  fs.mkdirSync(planned.logDir, { recursive: true });
  if (action === "install") writeUnit(planned.file, planned.body);
  const ran = runSteps(action === "install" ? planned.install : planned.uninstall, input.exec ?? systemExec);
  if (!ran.ok) return ran;
  if (action === "uninstall" && fs.existsSync(planned.file)) fs.unlinkSync(planned.file);
  return { ok: true as const, message: success };
}

function writeUnit(file: string, body: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, body, { mode: 0o644 });
}

function runSteps(steps: Step[], exec: Exec) {
  for (const step of steps) {
    const result = exec(step.cmd, step.args);
    if (!result.ok && !step.optional) return { ok: false as const, message: result.message || "자동 시작을 등록하지 못했어요." };
  }
  return { ok: true as const, message: "" };
}

function paths(input: Input): ServicePaths {
  return {
    platform: input.platform ?? process.platform,
    home: input.home ?? os.homedir(),
    node: input.node ?? process.execPath,
    script: input.script ?? process.argv[1] ?? "",
    uid: input.uid ?? currentUid(),
  };
}

function currentUid() {
  return typeof process.getuid === "function" ? process.getuid() : 0;
}

export function systemExec(cmd: string, args: string[]) {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.status === 0) return { ok: true, message: "" };
  return { ok: false, message: (result.stderr || result.stdout || "명령이 실패했어요.").trim() };
}
