import { isNode, LineCounter, parseDocument, type Document } from "yaml";
import type { ZodIssue, ZodTypeAny } from "zod";

export function parseYaml(file: string, text: string) {
  const lines = new LineCounter();
  const doc = parseDocument(text, { lineCounter: lines });
  const errors = doc.errors.map((error) => {
    const line = error.linePos?.[0]?.line ?? 1;
    return `${file}:${line} YAML을 읽지 못했어요`;
  });
  return { doc, lines, errors, value: doc.toJS() as unknown };
}

export function issueLine(doc: Document, path: (string | number)[], lines: LineCounter) {
  for (let end = path.length; end > 0; end -= 1) {
    const node = doc.getIn(path.slice(0, end), true);
    if (isNode(node) && node.range) return lines.linePos(node.range[0]).line;
  }
  return 1;
}

export function formatIssues(file: string, doc: Document, lines: LineCounter, issues: ZodIssue[]) {
  return issues.map((issue) => {
    const path = issue.path.map((part) => (typeof part === "number" ? part : String(part)));
    const line = issueLine(doc, path, lines);
    return `${file}:${line} ${issueText(issue)}`;
  });
}

function issueText(issue: ZodIssue) {
  const key = String(issue.path.at(-1) ?? "값");
  if (key === "id") return "id는 소문자, 숫자, 하이픈으로 2~40자여야 해요";
  if (key === "adapter") return "adapter는 echo, command, claude-agent-sdk, http 중 하나여야 해요";
  if (key === "version") return "version은 1이어야 해요";
  return `${key} 값을 확인해 주세요`;
}

export function checkSchema(file: string, text: string, schema: ZodTypeAny) {
  const parsed = parseYaml(file, text);
  if (parsed.errors.length) return { ok: false as const, errors: parsed.errors };
  const result = schema.safeParse(parsed.value);
  if (!result.success) {
    return { ok: false as const, errors: formatIssues(file, parsed.doc, parsed.lines, result.error.issues) };
  }
  return { ok: true as const, data: result.data, doc: parsed.doc, lines: parsed.lines };
}
