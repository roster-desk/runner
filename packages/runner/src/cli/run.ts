import readline from "node:readline";
import { runAgentsAdd } from "../agents/add.js";
import { clearLegacyCredential, credentialDir } from "../credential-store.js";
import { deleteRunnerKeys } from "../keys/keystore.js";
import { runDoctor } from "../keys/doctor.js";
import { clearRunnerId, loadRunnerId } from "../pairing/session.js";
import { startRunner, useDesktop, useHubUrl } from "../index.js";
import { HELP, parseArgs, type CliArgs } from "./args.js";
import { resolveHubUrl, RUNNER_VERSION, updateNotice } from "./hub.js";
import { confirmOverwrite, listAgents, recentLogs, showPolicy } from "./local.js";
import { installService, uninstallService } from "../service/install.js";

export async function runCli(argv: string[]) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  const local = await localCommand(args);
  if (local !== null) return local;
  return remoteCommand(args);
}

async function localCommand(args: CliArgs) {
  if (args.command === "agents" && args.rest[0] === "list") return print(listAgents(credentialDir()));
  if (args.command === "agents" && args.rest[0] === "add") return addAgent(args.rest.slice(1));
  if (args.command === "doctor") {
    await runDoctor();
    return 0;
  }
  if (args.command === "policy" && args.rest[0] === "show") return print(showPolicy(credentialDir()));
  if (args.command === "logs") return print(recentLogs(credentialDir()));
  if (args.command === "service") return serviceCommand(args.rest[0]);
  if (args.command === "unpair") return unpair();
  return null;
}

async function remoteCommand(args: CliArgs) {
  const hub = resolveHubUrl(args.hub);
  if (args.command === "pair") return pair(hub, args.ui, args.yes);
  if (args.command === "start") return connect(hub, args.ui);
  console.log(HELP);
  return 1;
}

async function connect(hub: string, ui: boolean) {
  const notice = await updateNotice(hub, RUNNER_VERSION);
  if (notice) console.log(notice);
  useHubUrl(hub);
  useDesktop(ui);
  await startRunner();
  return 0;
}

async function pair(hub: string, ui: boolean, yes: boolean) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ok = await confirmOverwrite(Boolean(loadRunnerId()), yes, (prompt) => question(rl, prompt));
  rl.close();
  if (!ok) return print("페어링을 취소했어요.");
  clearRunnerId();
  return connect(hub, ui);
}

async function unpair() {
  await deleteRunnerKeys();
  clearRunnerId();
  clearLegacyCredential();
  return print("이 PC의 키를 지웠어요. 폰의 PC 화면에서도 연동 해제를 눌러 주세요.");
}

async function addAgent(rest: string[]) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const result = await runAgentsAdd(rest, credentialDir(), (prompt) => question(rl, prompt));
  rl.close();
  return print(result.message);
}

function print(text: string) {
  console.log(text);
  return 0;
}

function serviceCommand(action: string | undefined) {
  if (action === "install") return finish(installService());
  if (action === "uninstall") return finish(uninstallService());
  console.log("roster-desk service install 또는 uninstall 을 쓰세요.");
  return 1;
}

function finish(result: { ok: boolean; message: string }) {
  console.log(result.message);
  return result.ok ? 0 : 1;
}

function question(rl: readline.Interface, prompt: string) {
  return new Promise<string>((resolve) => rl.question(prompt, resolve));
}
