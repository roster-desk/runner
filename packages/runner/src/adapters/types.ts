export type AgentDescriptor = {
  id: string;
  name: string;
  description: string;
  adapterKind: "echo" | "command" | "claude-agent-sdk" | "http";
  capabilities: string[];
};

export type ToolRequest = {
  toolName: string;
  input: unknown;
  summary?: string;
  suggestedRisk?: "low" | "medium" | "high";
};

export type ToolVerdict =
  | { decision: "approved"; scope: "once" | "session" | "always" }
  | { decision: "denied"; reason: "user" | "policy" | "expired" | "cancelled" };

export type AgentEvent =
  | { type: "status"; label: string }
  | { type: "delta"; text: string }
  | { type: "tool"; toolName: string; phase: "started" | "finished" | "failed"; summary: string }
  | { type: "final"; text: string }
  | { type: "error"; code: string; message: string };

export type TurnContext = {
  turnId: string;
  sessionKey: string;
  signal: AbortSignal;
  requestTool(req: ToolRequest): Promise<ToolVerdict>;
  emit(event: AgentEvent): void;
};

export interface AgentAdapter {
  readonly descriptor: AgentDescriptor;
  health(): Promise<{ ok: boolean; detail?: string }>;
  runTurn(text: string, ctx: TurnContext): Promise<void>;
  dispose(): Promise<void>;
}
