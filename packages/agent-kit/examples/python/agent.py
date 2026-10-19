#!/usr/bin/env python3
"""Roster Desk JSONL example. Standard library only."""
import json
import sys

turn_id = ""


def send(payload):
    sys.stdout.write(json.dumps(payload, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def main():
    global turn_id
    for line in sys.stdin:
        text = line.strip()
        if not text:
            continue
        try:
            msg = json.loads(text)
        except json.JSONDecodeError:
            print("bad json", file=sys.stderr)
            continue
        kind = msg.get("type")
        if kind == "hello":
            send({"type": "ready", "name": "예제", "capabilities": ["리포트 작성"]})
        elif kind == "turn":
            turn_id = msg.get("turnId", "")
            send({
                "type": "approval.request",
                "turnId": turn_id,
                "requestId": "r1",
                "toolName": "send_email",
                "input": {"to": "team@example.com"},
                "summary": "팀에 메일 보내기",
            })
        elif kind == "approval.result":
            if msg.get("decision") == "approved":
                send({"type": "final", "turnId": turn_id, "text": "리포트를 보냈어요."})
            else:
                send({"type": "final", "turnId": turn_id, "text": "보내지 않았어요."})
        elif kind == "cancel":
            send({"type": "error", "turnId": turn_id, "code": "cancelled", "message": "취소됐어요"})


if __name__ == "__main__":
    main()
