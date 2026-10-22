# Roster Desk Runner

The part of Roster Desk that runs on your own computer. It connects your agents to the Roster Desk app on your phone, so you can instruct them and approve their tool calls from anywhere.

내 PC에서 도는 Roster Desk 부분입니다. 내 에이전트를 폰 앱과 연결해, 어디서든 지시하고 도구 실행을 승인할 수 있게 합니다.

```bash
npx @rosterdesk/runner start
```

| Package | |
|---|---|
| `packages/runner` | CLI (`roster-desk`) |
| `packages/agent-kit` | Helpers for writing a JSONL agent |
| `packages/protocol` | Shared message schemas and the 6-digit pairing check (SAS) |

The Hub never runs your model and never holds your keys. Tool permissions live in `~/.roster-desk/policy.yaml` on this computer.

License: MIT
