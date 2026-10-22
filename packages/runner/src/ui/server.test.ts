import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createUiServer } from "./server.js";

const open: http.Server[] = [];
afterEach(() => open.splice(0).forEach((server) => server.close()));

async function start() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rd-ui-"));
  const ui = createUiServer({ token: "tok-123", dir, quit: () => undefined });
  open.push(ui.server);
  const url = new URL(await ui.listen());
  return { dir, base: `http://127.0.0.1:${url.port}`, port: url.port };
}

function raw(port: string, opts: { path: string; method?: string; host?: string; headers?: Record<string, string>; body?: string }) {
  return new Promise<{ status: number; body: string }>((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port, path: opts.path, method: opts.method ?? "GET", headers: { host: opts.host ?? `127.0.0.1:${port}`, ...opts.headers } },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on("error", reject);
    req.end(opts.body);
  });
}

describe("local UI", () => {
  it("serves the page only with the run token", async () => {
    const { port } = await start();
    expect((await raw(port, { path: "/" })).status).toBe(403);
    const page = await raw(port, { path: "/?t=tok-123" });
    expect(page.status).toBe(200);
    expect(page.body).toContain("--bg-canvas");
  });

  it("refuses other Host headers (DNS rebinding)", async () => {
    const { port } = await start();
    expect((await raw(port, { path: "/?t=tok-123", host: "evil.example:80" })).status).toBe(421);
  });

  it("needs the token header for API calls, so a cross-site POST cannot allow pairing", async () => {
    const { port } = await start();
    const blind = await raw(port, { path: "/api/pair", method: "POST", body: JSON.stringify({ decision: "allow" }) });
    expect(blind.status).toBe(403);
    const status = await raw(port, { path: "/api/status", headers: { "x-rd-token": "tok-123" } });
    expect(JSON.parse(status.body).phase).toBeDefined();
  });

  it("adds a webhook agent to agents.yaml", async () => {
    const { port, dir } = await start();
    const res = await raw(port, {
      path: "/api/agents/http",
      method: "POST",
      headers: { "x-rd-token": "tok-123", "content-type": "application/json" },
      body: JSON.stringify({ id: "weekly-report", name: "주간 보고", url: "https://n8n.example.com/webhook/abc" }),
    });
    expect(JSON.parse(res.body).ok).toBe(true);
    expect(fs.readFileSync(path.join(dir, "agents.yaml"), "utf8")).toContain("https://n8n.example.com/webhook/abc");
    const bad = await raw(port, {
      path: "/api/agents/http",
      method: "POST",
      headers: { "x-rd-token": "tok-123" },
      body: JSON.stringify({ id: "Bad Id", name: "x", url: "ftp://x" }),
    });
    expect(JSON.parse(bad.body).ok).toBe(false);
  });
});
