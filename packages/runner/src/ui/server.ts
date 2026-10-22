import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import QRCode from "qrcode";
import { addHttpAgent, addTemplate, templateList } from "../agents/add.js";
import { credentialDir } from "../credential-store.js";
import { runnerPage } from "./page.js";

export type DesktopPhase = "starting" | "qr" | "online" | "offline" | "revoked" | "confirm" | "expired";

export type RecentApproval = { at: number; agentId: string; toolName: string; risk: string; outcome: string };

export type DesktopStatus = {
  phase: DesktopPhase;
  detail: string;
  qr: string | null;
  confirmName: string;
  confirmSas: string;
  agents: { id: string; name: string; adapterKind: string }[];
  approvals: RecentApproval[];
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
  agents: [],
  approvals: [],
};

/** 데스크톱 셸(Tauri)은 stdout의 RD_STATUS 줄로 트레이 점 색을 바꾼다. */
export function setDesktopStatus(patch: Partial<DesktopStatus>) {
  const before = state.phase;
  Object.assign(state, patch);
  if (patch.phase && patch.phase !== before) console.log(`RD_STATUS ${JSON.stringify({ phase: state.phase, detail: state.detail })}`);
}

export function noteApproval(row: RecentApproval) {
  state.approvals = [row, ...state.approvals].slice(0, 10);
}

export function desktopState() {
  return state;
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
        /* 죽은 프로세스의 잠금 */
      }
    }
  }
  fs.writeFileSync(lock, String(process.pid), { mode: 0o600 });
  const release = () => {
    try {
      if (fs.readFileSync(lock, "utf8").trim() === String(process.pid)) fs.unlinkSync(lock);
    } catch {
      /* 이미 지워짐 */
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

type Route = (body: Record<string, unknown>) => unknown;

/**
 * 10.6절 로컬 UI. 127.0.0.1의 임의 포트, 실행마다 바뀌는 접근 토큰.
 * - Host가 127.0.0.1/localhost:포트가 아니면 거절 (DNS 리바인딩 차단)
 * - 페이지는 ?t=토큰, API는 x-rd-token 헤더. 사용자 정의 헤더라 다른 사이트의 fetch는 사전 요청에서 막힌다.
 */
export function createUiServer(opts: { token?: string; dir?: string; quit?: () => void } = {}) {
  const token = opts.token ?? randomBytes(24).toString("base64url");
  const dir = opts.dir ?? credentialDir();
  const routes: Record<string, Route> = {
    "POST /api/pair": (body) => {
      if (body.decision !== "allow" && body.decision !== "reject") return { ok: false };
      onPairDecision?.(body.decision);
      return { ok: true };
    },
    "GET /api/templates": () => ({ templates: templateList() }),
    "POST /api/agents/template": (body) => addTemplate(dir, String(body.templateId ?? ""), String(body.cwd ?? "")),
    "POST /api/agents/http": (body) =>
      addHttpAgent(dir, { id: String(body.id ?? ""), name: String(body.name ?? ""), url: String(body.url ?? "") }),
    "POST /api/quit": () => {
      setTimeout(() => (opts.quit ?? (() => process.exit(0)))(), 50);
      return { ok: true };
    },
    "GET /api/status": () => state,
  };
  let port = 0;
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (!hostAllowed(req.headers.host, port)) return deny(res, 421);
    if (url.pathname === "/" && req.method === "GET") {
      if (!same(url.searchParams.get("t") ?? "", token)) return deny(res, 403);
      res.setHeader("content-type", "text/html; charset=utf-8");
      res.setHeader("cache-control", "no-store");
      res.setHeader("content-security-policy", "default-src 'self'; img-src 'self' data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'");
      res.end(runnerPage());
      return;
    }
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return deny(res, 404);
    if (!same(String(req.headers["x-rd-token"] ?? ""), token)) return deny(res, 403);
    readBody(req)
      .then((body) => json(res, 200, route(body)))
      .catch(() => json(res, 400, { ok: false, message: "요청을 읽지 못했어요" }));
  });
  return {
    token,
    server,
    listen: () =>
      new Promise<string>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const address = server.address();
          port = typeof address === "object" && address ? address.port : 0;
          resolve(`http://127.0.0.1:${port}/?t=${token}`);
        });
      }),
  };
}

export async function startDesktop() {
  const ui = createUiServer();
  const url = await ui.listen();
  console.log(`RD_UI ${url}`);
  console.log("[runner] 로컬 화면이 열렸어요");
  openBrowser(url);
  return url;
}

function hostAllowed(host: string | undefined, port: number) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}

function same(given: string, expected: string) {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function deny(res: http.ServerResponse, status: number) {
  res.statusCode = status;
  res.end();
}

function json(res: http.ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 16_384) reject(new Error("too_large"));
    });
    req.on("end", () => {
      if (!raw) return resolve({});
      try {
        const parsed = JSON.parse(raw) as unknown;
        resolve(parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function openBrowser(url: string) {
  if (process.env.RUNNER_NO_BROWSER === "1") return;
  const platform = os.platform();
  const cmd = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url.replace(/&/g, "^&")] : [url];
  spawn(cmd, args, { stdio: "ignore", detached: true }).unref();
}
