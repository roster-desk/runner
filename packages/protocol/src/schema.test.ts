import { describe, expect, it } from "vitest";
import { ApprovalDecision, ApprovalRequest } from "./approval.js";
import { WsEnvelope } from "./envelope.js";
import { ApiErrorBody, ErrorCode } from "./errors.js";
import { QrPayloadV2 } from "./qr.js";
import { GuestAuthRequest, MessageV2, PairingClaimRequest, SseEvent } from "./rest.js";
import { HubToRunner, JsonlFromAgent, RunnerToHub } from "./ws.js";

const id = "00000000-0000-4000-8000-000000000001";
const hash = "ab".repeat(32);

function roundTrip<T>(schema: { parse: (value: unknown) => T }, value: T) {
  expect(schema.parse(JSON.parse(JSON.stringify(value)))).toEqual(value);
}

describe("v2 schemas", () => {
  it("round-trips the envelope, QR, approval, and error body", () => {
    roundTrip(WsEnvelope, {
      v: 2,
      id,
      type: "hello",
      ts: 1,
      data: { ok: true },
    });
    roundTrip(QrPayloadV2, {
      v: 2,
      sid: id,
      hub: "https://hub.kkumteul.co.kr",
      rpk: "abc",
      rsk: "def",
      exp: 1,
    });
    const request = {
      approvalId: id,
      turnId: id,
      conversationId: id,
      agentId: "repo-helper",
      toolName: "Edit",
      risk: "medium" as const,
      summary: "파일 수정",
      inputPreview: "{}",
      inputHash: hash,
      expiresAt: 1,
      allowedScopes: ["once" as const],
    };
    roundTrip(ApprovalRequest, request);
    roundTrip(ApprovalDecision, {
      approvalId: id,
      decision: "approved" as const,
      inputHash: hash,
      scope: "once" as const,
    });
    roundTrip(ApiErrorBody, { error: { code: "rate_limited" as const, message: "잠시 후" } });
    expect(ErrorCode.parse("untrusted_hub")).toBe("untrusted_hub");
  });

  it("round-trips runner messages, JSONL, and an SSE event", () => {
    roundTrip(RunnerToHub, { type: "heartbeat", data: {} });
    roundTrip(HubToRunner, { type: "runner.revoked", data: {} });
    roundTrip(JsonlFromAgent, { type: "final", turnId: "t1", text: "끝" });
    roundTrip(GuestAuthRequest, { displayName: "지서" });
    roundTrip(PairingClaimRequest, { sessionId: id, deviceId: id });
    const message = {
      id,
      conversationId: id,
      seq: 1,
      clientId: id,
      sender: "AGENT" as const,
      kind: "TEXT" as const,
      body: "안녕",
      createdAt: "2026-10-18T00:00:00.000Z",
    };
    roundTrip(MessageV2, message);
    roundTrip(SseEvent, { id: 3, event: "message.created", data: message });
    roundTrip(SseEvent, {
      event: "message.delta",
      data: { turnId: id, conversationId: id, text: "안" },
    });
  });
});
