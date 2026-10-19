import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import { WebSocketServer, WebSocket } from "ws";
import { createConfirmController } from "./confirm.js";

const keys = {
  signPublicKey: new Uint8Array(32).fill(1),
  boxPublicKey: new Uint8Array(32).fill(2),
};

const phoneBoxPub = Buffer.from(new Uint8Array(32).fill(3)).toString("base64url");

function confirmBody() {
  return {
    type: "pair.confirm_request",
    data: {
      sessionId: "00000000-0000-4000-8000-000000000001",
      claimer: { displayName: "지서" },
      phoneBoxPub,
    },
  };
}

describe("PC confirm", () => {
  it("sends allow after the terminal y on a fake hub socket", async () => {
    const wss = new WebSocketServer({ port: 0, host: "127.0.0.1" });
    await new Promise<void>((resolve) => wss.on("listening", () => resolve()));
    const port = (wss.address() as AddressInfo).port;
    const decision = new Promise<Record<string, unknown>>((resolve) => {
      wss.on("connection", (socket) => {
        socket.on("message", (raw) => resolve(JSON.parse(String(raw)) as Record<string, unknown>));
        socket.send(JSON.stringify(confirmBody()));
      });
    });
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    const lines: string[] = [];
    const controller = createConfirmController({
      keys,
      now: () => 1_000,
      send: (message) => client.send(JSON.stringify(message)),
      onShow: (view) => lines.push(...view.lines),
    });
    client.on("message", (raw) => {
      controller.onHubMessage(JSON.parse(String(raw)) as { type?: string });
      controller.onTerminalLine("y");
    });
    await new Promise<void>((resolve) => client.once("open", () => resolve()));
    const message = await decision;
    expect(message.type).toBe("pair.decision");
    expect(message.data).toMatchObject({ decision: "allow" });
    expect(lines.join("\n")).toContain("지서");
    expect(lines.join("\n")).toContain("허용하려면 y");
    client.close();
    wss.close();
  });

  it("shows expired and does not allow after two minutes", () => {
    let clock = 1_000;
    const sent: unknown[] = [];
    const controller = createConfirmController({
      keys,
      now: () => clock,
      send: (message) => sent.push(message),
    });
    controller.onHubMessage(confirmBody());
    clock += 2 * 60 * 1000;
    expect(controller.onTerminalLine("y")).toBe("expired");
    expect(sent).toHaveLength(0);
  });
});
