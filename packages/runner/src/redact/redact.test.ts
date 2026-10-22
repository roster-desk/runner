import { describe, expect, it } from "vitest";
import { inputHash, previewOf, redactText } from "./redact.js";

const cases = [
  ["sk-", `sk-${"a".repeat(20)}`],
  ["sk-ant", "sk-ant-api03-secret"],
  ["aws", "AKIAIOSFODNN7EXAMPLE"],
  ["github", `ghp_${"a".repeat(36)}`],
  ["slack", "xoxb-1234-abcd"],
  ["pem", "-----BEGIN RSA PRIVATE KEY-----"],
  ["jwt", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature"],
  ["password", "password=hunter2"],
];

describe("redact", () => {
  it.each(cases)("hides %s", (_name, secret) => {
    const text = `앞에 ${secret} 뒤에`;
    expect(redactText(text)).toBe("앞에 «가림:API 키» 뒤에");
    expect(redactText(text)).not.toContain(secret);
  });

  it("hashes the original text and hides an env secret", () => {
    const raw = "token=super-secret-value";
    const viewed = previewOf(raw, { APP_TOKEN: "super-secret-value", PATH: "/usr/bin" });
    expect(viewed.preview).toBe("token=«가림:API 키»");
    expect(viewed.inputHash).toBe(inputHash(raw));
    expect(viewed.inputHash).not.toBe(inputHash(viewed.preview));
    expect(viewed.inputHash).toHaveLength(64);
  });
});
