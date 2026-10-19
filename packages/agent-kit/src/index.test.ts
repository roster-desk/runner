import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { createAgent } from "./index.js";

describe("createAgent", () => {
  it("asks for approval and then sends final", async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const lines: string[] = [];
    output.on("data", (chunk) => lines.push(String(chunk)));
    createAgent(
      {
        name: "파일 정리",
        capabilities: ["파일 이동"],
        async onTurn(_turn, io) {
          const decision = await io.requestApproval({
            requestId: "move",
            toolName: "move_file",
            input: { from: "a" },
            summary: "옮기기",
          });
          io.final(decision === "approved" ? "옮겼어요" : "안 옮겼어요");
        },
      },
      { input, output },
    );
    input.write(`${JSON.stringify({ type: "hello", protocol: 1, agentId: "tidy" })}\n`);
    input.write(`${JSON.stringify({ type: "turn", turnId: "t1", sessionKey: "s1", text: "정리해 줘" })}\n`);
    await waitFor(() => lines.join("").includes("approval.request"));
    input.write(`${JSON.stringify({ type: "approval.result", requestId: "move", decision: "approved" })}\n`);
    await waitFor(() => lines.join("").includes("옮겼어요"));
  });
});

async function waitFor(ready: () => boolean) {
  const start = Date.now();
  while (!ready()) {
    if (Date.now() - start > 1000) throw new Error("timeout");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
