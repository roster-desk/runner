import { createAgent } from "@rosterdesk/agent-kit";

createAgent({
  name: "파일 정리",
  capabilities: ["파일 이동"],
  async onTurn(_turn, io) {
    const decision = await io.requestApproval({
      requestId: "move",
      toolName: "move_file",
      input: { from: "~/Downloads", to: "~/Documents" },
      summary: "다운로드 폴더를 정리해요",
    });
    io.final(decision === "approved" ? "정리 제안을 적용했어요." : "파일을 옮기지 않았어요.");
  },
});
