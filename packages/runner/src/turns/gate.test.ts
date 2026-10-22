import { describe, expect, it } from "vitest";
import { createTurnGate } from "./gate.js";

describe("turn gate", () => {
  it("rejects a second turn in the same conversation", () => {
    const gate = createTurnGate();
    const first = gate.begin("chat-1");
    expect(first.ok).toBe(true);
    expect(gate.begin("chat-1")).toEqual({ ok: false, code: "turn_in_progress" });
    if (first.ok) first.finish();
    expect(gate.begin("chat-1").ok).toBe(true);
  });

  it("allows four conversations and rejects the fifth", () => {
    const gate = createTurnGate(4);
    for (let i = 0; i < 4; i += 1) expect(gate.begin(`chat-${i}`).ok).toBe(true);
    expect(gate.begin("chat-4")).toEqual({ ok: false, code: "busy" });
  });
});
