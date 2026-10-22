/** 13절 디자인 토큰. 폰 앱(design/), Runner 로컬 UI, 소개 페이지가 같은 값을 쓴다. 컴포넌트는 의미 토큰만 쓴다. */
export const colors = {
  dark: {
    "bg.canvas": "#0F1216",
    "bg.surface": "#1A1F26",
    "bg.raised": "#222933",
    "bg.overlay": "rgba(0,0,0,0.6)",
    "border.default": "#2A313C",
    "border.strong": "#3A4350",
    "text.primary": "#E8ECF1",
    "text.secondary": "#9AA3B2",
    "text.tertiary": "#88909C",
    "text.onAccent": "#0B1020",
    "accent.primary": "#4C8DFF",
    "accent.primaryPressed": "#3B78E6",
    "state.online": "#3DB8A0",
    "state.waiting": "#E6A23C",
    "state.offline": "#D64545",
    "risk.low": "#9AA3B2",
    "risk.medium": "#E6A23C",
    "risk.high": "#D64545",
    "bubble.me": "#24364F",
    "bubble.agent": "#1A1F26",
    "banner.offlineBg": "#2A1515",
    "banner.waitingBg": "#2A2310",
    "banner.infoBg": "#15202E",
  },
  light: {
    "bg.canvas": "#F6F7F9",
    "bg.surface": "#FFFFFF",
    "bg.raised": "#EEF0F3",
    "bg.overlay": "rgba(15,18,22,0.4)",
    "border.default": "#DDE1E6",
    "border.strong": "#C3C9D1",
    "text.primary": "#11151A",
    "text.secondary": "#5B6472",
    "text.tertiary": "#676E78",
    "text.onAccent": "#FFFFFF",
    "accent.primary": "#2463EB",
    "accent.primaryPressed": "#1D4FC0",
    "state.online": "#16866F",
    "state.waiting": "#B7791F",
    "state.offline": "#C53030",
    "risk.low": "#5B6472",
    "risk.medium": "#B7791F",
    "risk.high": "#C53030",
    "bubble.me": "#DCE8FF",
    "bubble.agent": "#FFFFFF",
    "banner.offlineBg": "#FDECEC",
    "banner.waitingBg": "#FFF4E0",
    "banner.infoBg": "#E8F0FE",
  },
} as const;

export type ColorMode = keyof typeof colors;
export type ColorToken = keyof (typeof colors)["dark"];

export const type = {
  display: { size: 28, line: 34, weight: "700" },
  title: { size: 20, line: 26, weight: "600" },
  headline: { size: 17, line: 22, weight: "600" },
  body: { size: 15, line: 22, weight: "400" },
  callout: { size: 14, line: 20, weight: "500" },
  caption: { size: 12, line: 16, weight: "400" },
  mono: { size: 13, line: 18, weight: "400" },
  sas: { size: 36, line: 40, weight: "600" },
} as const;

export const space = { 0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40 } as const;
export const radius = { sm: 6, md: 10, lg: 14, xl: 20, full: 999 } as const;
export const motion = { fast: 120, base: 200, slow: 280, easing: "cubic-bezier(0.2, 0, 0, 1)" } as const;

/** 웹(Runner 로컬 UI·소개 페이지)용 CSS 변수. `bg.canvas` → `--bg-canvas`. */
export function cssVariables(mode: ColorMode) {
  const lines = Object.entries(colors[mode]).map(([name, value]) => `--${name.replace(/\./g, "-")}: ${value};`);
  for (const [name, value] of Object.entries(space)) lines.push(`--space-${name}: ${value}px;`);
  for (const [name, value] of Object.entries(radius)) lines.push(`--radius-${name}: ${value}px;`);
  return lines.join("\n");
}

/** WCAG 대비. RD-501 대비 검사에서 쓴다. */
export function contrastRatio(foreground: string, background: string) {
  const [a, b] = [luminance(foreground), luminance(background)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function luminance(hex: string) {
  const value = hex.replace("#", "");
  const channels = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) / 255);
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
