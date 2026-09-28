# telegram-report

예약 루틴이 끝날 때 리포트 한 건을 텔레그램 그룹의 **정해진 포럼 토픽**으로 보냅니다. 보내기만 합니다.

- 토픽은 thread id로 지정합니다. 클라우드 실행 환경에는 토픽 이름→id 목록이 없고 Bot API로 기존 토픽을 조회할 수도 없어서, 이름으로 보내면 실행마다 토픽이 새로 생깁니다. 그래서 루틴 파일(`routines/<name>.md`)이 자기 토픽의 id를 적어 둡니다.
- 자격 증명은 환경변수 `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`에서만 읽습니다.
- 토큰은 argv와 출력 어디에도 나오지 않습니다 (`curl -K -`로 stdin 전달, 실패 시 Telegram의 `description`만 출력).

## 사용

```bash
bash telegram-report/scripts/tg-report.sh 2862 "intake · RootProto — Triage 0건"
printf '%s' "$REPORT" | bash telegram-report/scripts/tg-report.sh 2862 -
```

종료 코드: 0 전송 · 2 사용법 · 3 자격 증명 없음 · 5 전송 실패.

## 새 루틴에 토픽 붙이기

1. 로컬에서 토픽을 만들고 id를 받습니다 (hermeneutic-assistant: `scripts/tg-send.sh "routine: <name>" "<안내>"` → `thread=<id>`).
2. `routines/<name>.md`에 그 id와 전송 단계를 적습니다.

## 테스트

```bash
bash telegram-report/scripts/tests/tg-report.test.sh
```
