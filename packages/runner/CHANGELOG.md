# Changelog

## 0.2.1 (2026-10-24)

- Default Hub is now `wss://hub.kkumteul.co.kr/runner`.

## 0.2.0 (2026-10-22)

- End-to-end encryption: messages and approval summaries are sealed per device; the Hub stores ciphertext only.
- Local window (`roster-desk start` opens it): pairing QR, 6-digit check, agents, recent approvals, add template or webhook agents.
- Webhook (n8n, Make) and Claude Agent SDK adapters; session-scoped approvals; secret redaction in previews.
- `roster-desk service install` to start on login.

## 0.1.0 (2026-10-19)

- First public release.
