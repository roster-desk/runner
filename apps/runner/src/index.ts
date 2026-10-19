import readline from "node:readline";
import WebSocket from "ws";
import { credentialDir } from "./credential-store.js";
import { publishRoster, watchRoster } from "./config/watch.js";
import { createTurnBook, handleTurnFrame } from "./turns/cancel.js";
import { ensureRunnerKeys } from "./keys/keystore.js";
import {
  acquireSingleInstance,
  qrDataUrl,
  setDesktopDecisionHandler,
  setDesktopStatus,
  startDesktop,
} from "./desktop.js";
import { createConfirmController, type RunnerPubs } from "./pairing/confirm.js";
import { helloFrame, loadRunnerId, offerFrame, proofFrame, saveRunnerId, clearRunnerId } from "./pairing/session.js";
import { resolveHubUrl } from "./cli/hub.js";

let hubWsUrl = resolveHubUrl();
let desktop = false;

export function useHubUrl(url: string) {
  hubWsUrl = url;
}

export function useDesktop(enabled: boolean) {
  desktop = enabled;
}
let confirm: ReturnType<typeof createConfirmController> | null = null;
let runnerPubs: RunnerPubs | null = null;
let signSecret: Uint8Array | null = null;

const stopped = false;
let heartbeat: NodeJS.Timeout | null = null;
let retry: NodeJS.Timeout | null = null;
let pairId: string | null = null;

function clearTimers() {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = null;
  if (retry) clearTimeout(retry);
  retry = null;
}

function scheduleReconnect() {
  if (stopped || retry) return;
  retry = setTimeout(() => {
    retry = null;
    void connect();
  }, 2000);
}

function armHeartbeat(ws: WebSocket) {
  if (heartbeat) clearInterval(heartbeat);
  heartbeat = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN && pairId) {
      ws.send(JSON.stringify({ type: "heartbeat", pairId }));
    }
  }, 10000);
}

async function showQr(payload: unknown) {
  const text = JSON.stringify(payload);
  console.log("[runner] QR JSON (폰에서 스캔)");
  console.log(text);
  if (!desktop) return;
  const qr = await qrDataUrl(text);
  setDesktopStatus({ phase: "qr", detail: "폰으로 이 QR을 스캔하세요", qr });
}

let stopWatch: (() => void) | null = null;
let activeSocket: WebSocket | null = null;

function publishCatalog(ws: WebSocket) {
  const roster = publishRoster(credentialDir());
  if (!roster.ok) {
    for (const error of roster.errors) console.error(`[runner] ${error}`);
    return;
  }
  ws.send(JSON.stringify(roster.frame));
  stopWatch?.();
  stopWatch = watchRoster(credentialDir(), (frame) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(frame));
  });
}

function connect() {
  const ws = new WebSocket(hubWsUrl);
  const turns = createTurnBook();
  activeSocket = ws;
  armHeartbeat(ws);

  ws.on("open", () => {
    const savedId = loadRunnerId();
    if (savedId) {
      console.log("[runner] auth with saved runner");
      setDesktopStatus({ phase: "starting", detail: "저장된 PC로 연결 중", qr: null });
      ws.send(JSON.stringify(helloFrame(savedId)));
      return;
    }
    if (!runnerPubs) return;
    ws.send(JSON.stringify(offerFrame(runnerPubs)));
  });

  ws.on("message", async (raw) => {
    const parsed = JSON.parse(String(raw)) as {
      v?: number;
      type?: string;
      data?: Record<string, unknown>;
      error?: string;
      pairId?: string;
      qr?: unknown;
      nonce?: string;
      runnerId?: string;
      payload?: Record<string, unknown>;
      sessionId?: string;
    };
    const msg = parsed.v === 2 && parsed.type
      ? { ...parsed.data, type: parsed.type, data: parsed.data }
      : parsed;

    if (msg.type === "error" || msg.type === "auth.fail") {
      const code = String(msg.error ?? (msg as { code?: string }).code ?? "");
      console.error("[runner]", msg.type, code);
      if (code === "revoked") {
        clearRunnerId();
        setDesktopStatus({ phase: "revoked", detail: "PC 연동이 해제됐어요. 다시 스캔하세요", qr: null });
      }
      return;
    }

    if (msg.type === "pair.qr" && msg.qr) {
      await showQr(msg.qr);
      return;
    }

    if (msg.type === "pair.confirm_request" && confirm) {
      const view = confirm.onHubMessage(msg);
      if (!view) return;
      for (const line of view.lines) console.log(line);
      setDesktopStatus({
        phase: "confirm",
        detail: view.lines[0] ?? "",
        confirmName: view.displayName,
        confirmSas: view.sas,
        qr: null,
      });
      return;
    }

    if (msg.type === "pair.bound") {
      const runnerId = String((msg as { runnerId?: string }).runnerId ?? "");
      if (!runnerId) return;
      saveRunnerId(runnerId);
      pairId = runnerId;
      return;
    }

    if (msg.type === "auth.challenge" && signSecret) {
      const nonce = String((msg as { nonce?: string }).nonce ?? "");
      const runnerId = loadRunnerId();
      if (!runnerId || !nonce) return;
      ws.send(JSON.stringify(proofFrame(runnerId, nonce, signSecret)));
      return;
    }

    if (msg.type === "auth.ok") {
      pairId = String((msg as { runnerId?: string }).runnerId ?? msg.pairId ?? pairId);
      console.log("[runner] online", pairId);
      setDesktopStatus({ phase: "online", detail: "PC online", qr: null });
      publishCatalog(ws);
      return;
    }

    if (msg.type === "ack") return;

    const turn = handleTurnFrame(msg.type, msg.data, turns);
    if (turn.handled) {
      if ("status" in turn && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ v: 2, type: "turn.status", ts: Date.now(), data: turn.status }));
      }
      return;
    }

    if (msg.type === "chat.user") {
      const sessionId = String(msg.sessionId ?? "");
      const text = String(msg.payload?.text ?? "");
      console.log(`[runner] ← mobile: ${text}`);
      const reply = `PC 에이전트 응답: ${text}`;
      ws.send(
        JSON.stringify({
          type: "chat.done",
          pairId,
          sessionId,
          payload: { text: reply },
        }),
      );
      return;
    }

    if (msg.type === "hitl.decision") {
      const decision = String(msg.payload?.decision ?? "");
      ws.send(
        JSON.stringify({
          type: "chat.done",
          pairId,
          sessionId: String(msg.sessionId ?? ""),
          payload: {
            text:
              decision === "approved"
                ? "도구 실행 완료 (PC에서 처리됨)"
                : "도구 실행이 거절되었습니다.",
          },
        }),
      );
    }
  });

  ws.on("close", () => {
    if (heartbeat) clearInterval(heartbeat);
    heartbeat = null;
    pairId = null;
    setDesktopStatus({ phase: "offline", detail: "잠시 연결이 끊겼어요", qr: null });
    console.log("[runner] disconnected — reconnecting in 2s");
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    console.error("[runner] ws error", err.message);
  });
}

export async function startRunner() {
  await openKeys();
  if (refuseStart()) return;
  if (desktop) await startDesktop();
  connect();
  watchStdin();
}

async function openKeys() {
  const storedKeys = await ensureRunnerKeys();
  runnerPubs = storedKeys;
  signSecret = storedKeys.signSecretKey;
  confirm = createConfirmController({
    keys: storedKeys,
    send: sendToHub,
    onShow: showExpired,
  });
  setDesktopDecisionHandler((decision) => {
    confirm?.onTerminalLine(decision === "allow" ? "y" : "n");
  });
}

function sendToHub(message: unknown) {
  const socket = activeSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(message));
}

function showExpired(view: { kind: string; lines: string[] }) {
  if (view.kind !== "expired") return;
  setDesktopStatus({ phase: "expired", detail: view.lines[0] ?? "", qr: null });
  console.log(view.lines[0]);
}

function refuseStart() {
  if (desktop && !acquireSingleInstance()) {
    console.error("[runner] 이미 실행 중입니다.");
    process.exit(1);
  }
  warnHubEnv();
  if (process.env.NODE_ENV === "production" && !hubWsUrl.startsWith("wss://")) {
    console.error("[runner] production requires HUB_WS_URL=wss://<host>/runner");
    process.exit(1);
  }
  return false;
}

function warnHubEnv() {
  const primary = process.env.HUB_WS_URL?.trim();
  const legacy = process.env.HUB_WS?.trim();
  if (primary && legacy && primary !== legacy) console.warn("[runner] HUB_WS_URL and HUB_WS differ; using HUB_WS_URL");
}

function watchStdin() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.on("line", (line) => {
    const outcome = confirm?.onTerminalLine(line);
    if (outcome === "allow" || outcome === "reject" || outcome === "expired" || !runnerPubs) return;
    console.log("[runner] stdin은 사용하지 않습니다. 폰에서 지시하세요.");
  });
}

export { clearTimers, stopped };
