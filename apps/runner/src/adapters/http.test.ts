import { createServer, type IncomingMessage, type Server } from "node:http";
import type { Socket } from "node:net";
import { describe, expect, it } from "vitest";
import { installAdapters } from "./install.js";
import type { AdapterAgent } from "./registry.js";
import type { AgentEvent, TurnContext } from "./types.js";

function agent(url: string, timeoutSec = 1): AdapterAgent {
  return {
    id: "n8n-invoice",
    name: "청구서 처리",
    description: "",
    adapter: "http",
    capabilities: ["청구서"],
    options: { url, timeoutSec, headers: { "X-Api-Key": "${env:N8N_KEY}" } },
    policy: "dev-default",
  };
}

function harness(decision: "approved" | "denied" = "approved") {
  const events: AgentEvent[] = [];
  const controller = new AbortController();
  const ctx: TurnContext = {
    turnId: "t1",
    sessionKey: "s1",
    signal: controller.signal,
    async requestTool() {
      return decision === "approved" ? { decision: "approved", scope: "once" } : { decision: "denied", reason: "user" };
    },
    emit(event) {
      events.push(event);
    },
  };
  return { events, controller, ctx };
}

function readBody(req: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function serve(onRequest: (req: IncomingMessage, body: unknown, reply: (status: number, json?: unknown) => void) => void) {
  const sockets = new Set<Socket>();
  const server = createServer((req, res) => {
    void readBody(req).then((raw) => {
      onRequest(req, JSON.parse(raw) as unknown, (status, json) => {
        res.writeHead(status, json === undefined ? undefined : { "content-type": "application/json" });
        res.end(json === undefined ? undefined : JSON.stringify(json));
      });
    });
  });
  track(server, sockets);
  const url = await listen(server);
  return { url, close: () => shutdown(server, sockets) };
}

function track(server: Server, sockets: Set<Socket>) {
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
}

function listen(server: Server) {
  return new Promise<string>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve(`http://127.0.0.1:${port}/hook`);
    });
  });
}

function shutdown(server: Server, sockets: Set<Socket>) {
  for (const socket of sockets) socket.destroy();
  return new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("http adapter", () => {
  it("finishes a synchronous webhook reply", async () => {
    const hook = await serve((_req, body, reply) => {
      const turn = body as { text: string };
      reply(200, { type: "final", turnId: "t1", text: `${turn.text} 끝` });
    });
    const run = harness();
    await installAdapters().create(agent(hook.url)).runTurn("청구서", run.ctx);
    expect(run.events.at(-1)).toEqual({ type: "final", text: "청구서 끝" });
    await hook.close();
  });

  it("posts the approval result and then reads the final reply", async () => {
    const seen: string[] = [];
    const hook = await serve((_req, body, reply) => {
      const message = body as { type: string; decision?: string };
      seen.push(message.type);
      if (message.type === "turn") {
        reply(200, { type: "approval.request", turnId: "t1", requestId: "r1", toolName: "write_file", input: { path: "a" }, summary: "파일 쓰기" });
        return;
      }
      seen.push(message.decision ?? "");
      reply(200, { type: "final", turnId: "t1", text: "처리했어요." });
    });
    const run = harness();
    await installAdapters().create(agent(hook.url)).runTurn("처리", run.ctx);
    expect(seen).toEqual(["turn", "approval.result", "approved"]);
    expect(run.events.at(-1)).toEqual({ type: "final", text: "처리했어요." });
    await hook.close();
  });

  it("accepts callback events after 202", async () => {
    const hook = await serve(async (_req, body, reply) => {
      const message = body as { callbackUrl: string };
      reply(202);
      await fetch(message.callbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "approval.request", turnId: "t1", requestId: "r1", toolName: "send_email", input: { to: "a" }, summary: "메일" }),
      }).then(async (response) => {
        expect(await response.json()).toMatchObject({ decision: "denied" });
      });
      await fetch(message.callbackUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "final", turnId: "t1", text: "보내지 않았어요." }),
      });
    });
    const run = harness("denied");
    await installAdapters().create(agent(hook.url)).runTurn("보내", run.ctx);
    expect(run.events.at(-1)).toEqual({ type: "final", text: "보내지 않았어요." });
    await hook.close();
  });

  it("reports timeout, 4xx, and 5xx", async () => {
    const hanging = await serve(() => {});
    const missing = await serve((_req, _body, reply) => reply(404));
    const failed = await serve((_req, _body, reply) => reply(500));
    const slow = harness();
    await installAdapters().create(agent(hanging.url, 0.2)).runTurn("기다려", slow.ctx);
    const gone = harness();
    await installAdapters().create(agent(missing.url)).runTurn("없어", gone.ctx);
    const broken = harness();
    await installAdapters().create(agent(failed.url)).runTurn("오류", broken.ctx);
    expect(slow.events.at(-1)).toMatchObject({ code: "timeout" });
    expect(gone.events.at(-1)).toMatchObject({ code: "http_status", message: "웹훅이 404 응답을 돌려줬어요" });
    expect(broken.events.at(-1)).toMatchObject({ code: "http_status", message: "웹훅이 500 응답을 돌려줬어요" });
    await hanging.close();
    await missing.close();
    await failed.close();
  });

  it("fills header secrets from the environment", async () => {
    process.env.N8N_KEY = "local-secret";
    let header = "";
    const hook = await serve((req, _body, reply) => {
      header = req.headers["x-api-key"]?.toString() ?? "";
      reply(200, { type: "final", turnId: "t1", text: "확인" });
    });
    await installAdapters().create(agent(hook.url)).runTurn("키", harness().ctx);
    expect(header).toBe("local-secret");
    delete process.env.N8N_KEY;
    await hook.close();
  });
});
