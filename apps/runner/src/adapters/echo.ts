import type { AdapterAgent } from "./registry.js";
import type { AgentAdapter, AgentEvent } from "./types.js";

export function createEchoAdapter(agent: AdapterAgent): AgentAdapter {
  const descriptor = {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    adapterKind: "echo" as const,
    capabilities: agent.capabilities,
  };
  return {
    descriptor,
    async health() {
      return { ok: true };
    },
    async runTurn(text, ctx) {
      if (text.includes("/tool")) {
        const verdict = await ctx.requestTool({ toolName: "echo_tool", input: { text } });
        const event: AgentEvent =
          verdict.decision === "approved"
            ? { type: "final", text }
            : { type: "error", code: "denied", message: "도구 사용이 거절됐어요" };
        ctx.emit(event);
        return;
      }
      ctx.emit({ type: "final", text });
    },
    async dispose() {
      return undefined;
    },
  };
}
