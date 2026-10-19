import { describe, expect, it } from "vitest";
import type { AdapterAgent } from "./registry.js";
import { createEchoAdapter } from "./echo.js";
import { installAdapters } from "./install.js";
import type { AgentEvent, ToolVerdict } from "./types.js";

const agent: AdapterAgent = {
  id: "echo",
  name: "에코",
  description: "개발용",
  adapter: "echo",
  capabilities: ["메아리"],
  options: {},
  policy: "dev-default",
};

function ctx(onTool: () => Promise<ToolVerdict>) {
  const events: AgentEvent[] = [];
  return {
    events,
    turn: {
      turnId: "t1",
      sessionKey: "s1",
      signal: new AbortController().signal,
      requestTool: onTool,
      emit(event: AgentEvent) {
        events.push(event);
      },
    },
  };
}

describe("echo adapter", () => {
  it("is absent unless RUNNER_DEV=1", () => {
    expect(installAdapters({}).create).toBeTypeOf("function");
    expect(() => installAdapters({}).create(agent)).toThrow(/adapter_missing:echo/);
    expect(installAdapters({ RUNNER_DEV: "1" }).create(agent).descriptor.id).toBe("echo");
  });

  it("echoes text and does not treat 승인필요 as a tool", async () => {
    let tools = 0;
    const harness = ctx(async () => {
      tools += 1;
      return { decision: "approved", scope: "once" };
    });
    await createEchoAdapter(agent).runTurn("승인필요 해줘", harness.turn);
    expect(tools).toBe(0);
    expect(harness.events).toEqual([{ type: "final", text: "승인필요 해줘" }]);
  });

  it("asks for echo_tool when the text contains /tool", async () => {
    const harness = ctx(async () => ({ decision: "approved", scope: "once" }));
    await createEchoAdapter(agent).runTurn("/tool", harness.turn);
    expect(harness.events).toEqual([{ type: "final", text: "/tool" }]);
  });
});
