import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import QRCode from "qrcode";
import { credentialDir } from "./credential-store.js";
import { runnerPage } from "./ui/page.js";

export type DesktopStatus = {
  phase: "starting" | "qr" | "online" | "offline" | "revoked" | "confirm" | "expired";
  detail: string;
  qr: string | null;
  confirmName: string;
  confirmSas: string;
};

type PairDecision = "allow" | "reject";

let onPairDecision: ((decision: PairDecision) => void) | null = null;

export function setDesktopDecisionHandler(handler: (decision: PairDecision) => void) {
  onPairDecision = handler;
}

const state: DesktopStatus = {
  phase: "starting",
  detail: "연결 준비",
  qr: null,
  confirmName: "",
  confirmSas: "",
};

export function setDesktopStatus(patch: Partial<DesktopStatus>) {
  Object.assign(state, patch);
}

export function acquireSingleInstance(dir = credentialDir()): boolean {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const lock = path.join(dir, "runner.lock");
  if (fs.existsSync(lock)) {
    const pid = Number(fs.readFileSync(lock, "utf8"));
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0);
        return false;
      } catch {
        /* stale lock */
      }
    }
  }
  fs.writeFileSync(lock, String(process.pid), { mode: 0o600 });
  const release = () => {
    try {
      if (fs.readFileSync(lock, "utf8").trim() === String(process.pid)) fs.unlinkSync(lock);
    } catch {
      /* ignore */
    }
  };
  process.on("exit", release);
  process.on("SIGINT", () => {
    release();
    process.exit(0);
  });
  return true;
}

export async function qrDataUrl(text: string) {
  return QRCode.toDataURL(text, { margin: 1, width: 280 });
}

export function startDesktop(): Promise<number> {
  const server = http.createServer((req, res) => {
    if (req.url === "/status") {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(state));
      return;
    }
    if (req.url === "/pair/allow" && req.method === "POST") {
      onPairDecision?.("allow");
      res.end("ok");
      return;
    }
    if (req.url === "/pair/reject" && req.method === "POST") {
      onPairDecision?.("reject");
      res.end("ok");
      return;
    }
    if (req.url === "/quit" && req.method === "POST") {
      res.end("ok");
      process.exit(0);
      return;
    }
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(runnerPage());
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      const url = `http://127.0.0.1:${port}`;
      console.log(`[runner] desktop ${url}`);
      openBrowser(url);
      resolve(port);
    });
  });
}

function openBrowser(url: string) {
  if (process.env.RUNNER_NO_BROWSER === "1") return;
  const platform = os.platform();
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}
