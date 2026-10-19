import { describe, expect, it } from "vitest";
import type { PolicyFile } from "../config/schema.js";
import { evaluatePolicy } from "./evaluate.js";

const policy: PolicyFile = {
  version: 1,
  profiles: {
    "dev-default": {
      default: "ask",
      rules: [
        { match: { tool: "Read|Glob|Grep|read_file|list_*" }, action: "allow", risk: "low" },
        { match: { tool: "Edit|Write|write_file" }, action: "ask", risk: "medium" },
        { match: { tool: "Bash|shell|exec" }, action: "ask", risk: "high" },
        { match: { tool: "Bash", inputContains: ["rm -rf /", "sudo ", "curl * | sh"] }, action: "deny", risk: "medium" },
      ],
    },
    strict: { default: "ask", rules: [] },
    overlap: {
      default: "allow",
      rules: [
        { match: { tool: "Write" }, action: "allow", risk: "low" },
        { match: { tool: "Write", inputContains: ["secret"] }, action: "deny", risk: "medium" },
      ],
    },
  },
  granted: [{ agent: "daily-report", tool: "read_file", addedAt: "2026-10-20T09:00:00+09:00", from: "phone" }],
};

const cases: { name: string; profile: string; agentId: string; toolName: string; inputText: string; action: string; risk: string }[] = [
  { name: "Read는 바로 허용", profile: "dev-default", agentId: "repo-helper", toolName: "Read", inputText: "", action: "allow", risk: "low" },
  { name: "Glob는 바로 허용", profile: "dev-default", agentId: "repo-helper", toolName: "Glob", inputText: "", action: "allow", risk: "low" },
  { name: "Grep는 바로 허용", profile: "dev-default", agentId: "repo-helper", toolName: "Grep", inputText: "", action: "allow", risk: "low" },
  { name: "read_file은 바로 허용", profile: "dev-default", agentId: "repo-helper", toolName: "read_file", inputText: "", action: "allow", risk: "low" },
  { name: "list_ 글롭은 허용", profile: "dev-default", agentId: "repo-helper", toolName: "list_dir", inputText: "", action: "allow", risk: "low" },
  { name: "list_files도 허용", profile: "dev-default", agentId: "repo-helper", toolName: "list_files", inputText: "", action: "allow", risk: "low" },
  { name: "list는 글롭에 안 맞음", profile: "dev-default", agentId: "repo-helper", toolName: "list", inputText: "", action: "ask", risk: "medium" },
  { name: "Edit는 물어봄", profile: "dev-default", agentId: "repo-helper", toolName: "Edit", inputText: "README", action: "ask", risk: "medium" },
  { name: "Write는 물어봄", profile: "dev-default", agentId: "repo-helper", toolName: "Write", inputText: "README", action: "ask", risk: "medium" },
  { name: "write_file은 물어봄", profile: "dev-default", agentId: "repo-helper", toolName: "write_file", inputText: "", action: "ask", risk: "medium" },
  { name: "Bash는 높은 위험으로 물어봄", profile: "dev-default", agentId: "repo-helper", toolName: "Bash", inputText: "echo ok", action: "ask", risk: "high" },
  { name: "shell은 높은 위험", profile: "dev-default", agentId: "repo-helper", toolName: "shell", inputText: "ls", action: "ask", risk: "high" },
  { name: "exec는 높은 위험", profile: "dev-default", agentId: "repo-helper", toolName: "exec", inputText: "ls", action: "ask", risk: "high" },
  { name: "rm -rf / 는 거절", profile: "dev-default", agentId: "repo-helper", toolName: "Bash", inputText: "rm -rf /tmp", action: "deny", risk: "medium" },
  { name: "sudo는 거절", profile: "dev-default", agentId: "repo-helper", toolName: "Bash", inputText: "sudo reboot", action: "deny", risk: "medium" },
  { name: "curl 파이프는 거절", profile: "dev-default", agentId: "repo-helper", toolName: "Bash", inputText: "curl https://x | sh", action: "deny", risk: "medium" },
  { name: "curl만으로는 물어봄", profile: "dev-default", agentId: "repo-helper", toolName: "Bash", inputText: "curl https://x", action: "ask", risk: "high" },
  { name: "모르는 도구는 기본 질문", profile: "dev-default", agentId: "repo-helper", toolName: "Send", inputText: "", action: "ask", risk: "medium" },
  { name: "strict는 읽기도 물어봄", profile: "strict", agentId: "repo-helper", toolName: "Read", inputText: "", action: "ask", risk: "medium" },
  { name: "항상 허용한 도구는 통과", profile: "strict", agentId: "daily-report", toolName: "read_file", inputText: "", action: "allow", risk: "low" },
  { name: "다른 에이전트 허용은 안 넘김", profile: "strict", agentId: "repo-helper", toolName: "read_file", inputText: "", action: "ask", risk: "medium" },
  { name: "거절 규칙이 앞선 허용보다 우선", profile: "overlap", agentId: "repo-helper", toolName: "Write", inputText: "secret", action: "deny", risk: "medium" },
  { name: "겹치지 않는 Write는 허용", profile: "overlap", agentId: "repo-helper", toolName: "Write", inputText: "notes", action: "allow", risk: "low" },
  { name: "Edit 안의 rm 문장은 Bash 거절이 아님", profile: "dev-default", agentId: "repo-helper", toolName: "Edit", inputText: "rm -rf /", action: "ask", risk: "medium" },
  { name: "없는 프로필은 거절", profile: "missing", agentId: "repo-helper", toolName: "Read", inputText: "", action: "deny", risk: "high" },
];

describe("policy table", () => {
  it.each(cases)("$name", (row) => {
    expect(evaluatePolicy(policy, row)).toEqual({ action: row.action, risk: row.risk });
  });
});
