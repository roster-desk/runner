#!/usr/bin/env python3
"""일일 리포트 템플릿. 표준 라이브러리만 사용한다."""
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
        msg = json.loads(line)
        kind = msg.get("type")
        if kind == "hello":
            send({"type": "ready", "name": "일일 리포트", "capabilities": ["리포트 작성"]})
        elif kind == "turn":
            turn_id = msg.get("turnId", "")
            send({
                "type": "approval.request",
                "turnId": turn_id,
                "requestId": "write-report",
                "toolName": "write_file",
                "input": {"path": "report.md"},
                "summary": "리포트 파일 쓰기",
            })
        elif kind == "approval.result" and msg.get("decision") == "approved":
            send({"type": "final", "turnId": turn_id, "text": "리포트를 보냈어요."})
        elif kind == "approval.result":
            send({"type": "final", "turnId": turn_id, "text": "보내지 않았어요."})
        elif kind == "cancel":
            send({"type": "error", "turnId": turn_id, "code": "cancelled", "message": "취소됐어요"})


if __name__ == "__main__":
    main()
