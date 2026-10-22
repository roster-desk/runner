import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.expo/**",
      "**/.next/**",
      "docs/archive/**",
      ".pnpm-store/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // RD-505: 폰 화면 문구는 i18n/*.json에만. JSX 글자와 속성 문자열에 한글을 직접 쓰지 않는다.
    files: ["apps/mobile/src/**/*.tsx"],
    ignores: ["**/*.test.tsx", "apps/mobile/src/design/Gallery.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        { selector: "JSXText[value=/[가-힣]/]", message: "화면 문구는 i18n/ko.json·en.json에 넣고 t()로 읽으세요" },
        { selector: "JSXAttribute Literal[value=/[가-힣]/]", message: "화면 문구는 i18n/ko.json·en.json에 넣고 t()로 읽으세요" },
        { selector: "JSXExpressionContainer Literal[value=/[가-힣]/]", message: "화면 문구는 i18n/ko.json·en.json에 넣고 t()로 읽으세요" },
        { selector: "JSXExpressionContainer TemplateElement[value.raw=/[가-힣]/]", message: "화면 문구는 i18n/ko.json·en.json에 넣고 t()로 읽으세요" },
      ],
    },
  },
);
