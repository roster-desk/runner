# Roster Desk Runner

PC에서 에이전트를 실행하고 폰의 승인함과 연결합니다.

This program runs your agents on a PC and connects them to the Roster Desk inbox on your phone.

## 설치 / Install

Node.js 20 이상이 필요합니다. Node.js 20 or newer is required.

```bash
npx @rosterdesk/runner start
```

기본 Hub는 `wss://roster-desk-hub.fly.dev/runner`입니다. 다른 주소는 `--hub`로 바꿉니다.

The default Hub is `wss://roster-desk-hub.fly.dev/runner`. Pass `--hub` to use another address.

```bash
npx @rosterdesk/runner start --hub ws://localhost:3100/runner --ui
```

QR이 터미널에 출력됩니다. 폰 앱으로 스캔한 뒤, PC에서 `y`를 누르면 연결됩니다.

The terminal prints a QR code. Scan it in the phone app, then press `y` on the PC to allow the connection.

## 명령 / Commands

| 명령 | 하는 일 |
|------|---------|
| `roster-desk start` | Hub에 연결. `--ui`는 로컬 창 |
| `roster-desk pair` | 다시 페어링 |
| `roster-desk unpair` | 이 PC의 키를 삭제 |
| `roster-desk agents list` | 에이전트 목록 |
| `roster-desk agents add` | 템플릿으로 추가 |
| `roster-desk doctor` | 환경 점검 |
| `roster-desk policy show` | 정책 출력 |
| `roster-desk logs` | 최근 로그 |

`service install`은 로그인할 때 Runner를 켭니다. macOS는 launchd, Windows는 작업 스케줄러, Linux는 systemd 사용자 유닛을 등록합니다. `service uninstall`은 그 등록을 지웁니다.

`service install` starts the Runner when you log in. macOS uses launchd, Windows uses Task Scheduler, and Linux uses a systemd user unit. `service uninstall` removes that registration.

## 라이선스 / License

MIT. Hub와 폰 앱은 이 패키지에 포함되지 않습니다. The Hub and the phone app are not part of this package.
