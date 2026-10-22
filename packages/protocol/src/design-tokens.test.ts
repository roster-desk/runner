import { describe, expect, it } from "vitest";
import { colors, contrastRatio, cssVariables } from "./design-tokens.js";

describe("design tokens", () => {
  it("has the same keys in dark and light", () => {
    expect(Object.keys(colors.light).sort()).toEqual(Object.keys(colors.dark).sort());
  });

  it("emits css variables", () => {
    expect(cssVariables("dark")).toContain("--bg-canvas: #0F1216;");
    expect(cssVariables("light")).toContain("--radius-md: 10px;");
  });

  it("computes WCAG contrast", () => {
    expect(contrastRatio("#000000", "#FFFFFF")).toBeCloseTo(21, 0);
  });
});
