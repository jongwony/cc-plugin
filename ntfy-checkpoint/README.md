# ntfy-checkpoint

정해진 분(minute)에 한 번 확인해야 하는 일을, 미리 ntfy에 예약해 두었다가 그 시각에 휴대폰으로 받는 플러그인입니다. 예약된 목록이 캘린더나 미리 알림에 보이지 않고, 메시지에는 무엇을 확인할지 한 줄과 나머지를 찾아갈 세션 id만 담깁니다.

- 30분 이상 블록 → 캘린더
- Claude의 완료·입력 대기 알림 → Claude Code 알림 (섞이지 않게)
- 분 단위 일회성 확인 → 이 플러그인

## 보내는 길

- `aiward-send`가 PATH에 있으면(aiward 플러그인이 설치된 기기) push는 전부 aiward를 거칩니다. 세션은 ntfy 도구를 부르지 않고, 토픽은 `--area work|personal`로 고릅니다. 예약은 `--at`, 고쳐 보내기는 `--sequence-id`입니다.
- 없으면 아래 두 ntfy 서버로 직접 보냅니다.
- aiward를 거칠 때는 세션이 ntfy 기록을 읽지 않습니다. 그래서 상태는 `queued`(aiward가 받아 둠), `accepted direct`(채널이 멎어 보내는 쪽이 직접 보냄), `unsent`(어디에도 닿지 않음), `checked`까지만 기록하고, 휴대폰으로 나갔다는 `delivered`는 기록하지 않습니다. 탭은 예약한 세션으로만 갑니다.

## 구성

aiward가 없는 기기에서 쓰는 서버입니다.

| 서버 | 용도 | 토픽 |
|---|---|---|
| `ntfy-work` | 회사 일 | `work_topic` 옵션 |
| `ntfy-personal` | 개인 일 | `personal_topic` 옵션 |

두 서버 모두 [cyanheads/ntfy-mcp-server](https://github.com/cyanheads/ntfy-mcp-server)(Apache-2.0)를 `npx`로 띄웁니다. 예약·교체·조회 방법은 그 서버가 함께 내려주는 `ntfy-guide`가 맡고, 이 플러그인의 skill은 어느 서버로 무엇을 보낼지만 정합니다.

## 설정

```
/plugin install ntfy-checkpoint --marketplace jongwony/cc-plugin
```

1. Node.js(`npx`)를 준비합니다.
2. 추측하기 어려운 토픽 두 개를 만들고, 휴대폰 ntfy 앱에서 둘 다 구독합니다. 토픽 이름이 곧 비밀번호입니다.
3. `claude plugin configure ntfy-checkpoint`로 두 토픽을 넣습니다. 값은 OS 자격 증명 저장소에 들어갑니다. 조회·예약 도구의 응답에는 토픽과 URL이 그대로 나오므로 세션 기록에는 남습니다.

## 체크포인트 기록 (ntfy 서버로 직접 보낼 때)

체크포인트는 백그라운드 세션에서 예약합니다. 세션은 스스로 깨어나지 않습니다. 대신 예약한 세션의 기록에 체크포인트마다 한 줄씩 상태를 남깁니다. push를 탭하면 Claude 앱에서 그 세션이 열립니다. Airflow 화면처럼 확인할 페이지가 따로 있으면 탭은 그 페이지로 가고, 세션은 '세션 열기' 버튼으로 엽니다. 터미널에서는 본문의 `claude attach <short id>`로 엽니다. 세션이 멈춘 뒤라면 `claude --bg --resume <session id>`로 같은 세션을 다시 띄웁니다. 다른 세션은 세션 id로 그 줄을 찾아 이어갈 수 있습니다. sequence id는 `<short id>-<step>` 꼴이라 다른 세션의 push를 대체하지 않습니다. short id가 가리키는 세션이 그 체크포인트의 주인입니다.

```
intent ──발행──▶ accepted <id> ──시각 경과──▶ delivered ──확인──▶ checked: <근거>
   │
   └─결과 대신 오류─▶ 몇 초 뒤 조회 ─┬─ 있음 ─▶ accepted <id>
                                    └─ 없음·조회 실패 ─▶ unconfirmed (세션에 보고)
```

- 서버가 받았다(accepted), 휴대폰으로 나갔다(delivered), 확인했다(checked)는 각각 따로 기록합니다. 앞의 상태가 뒤의 상태를 뜻하지 않습니다.
- 조회 결과가 비어도 아무 상태도 정해지지 않습니다. ntfy.sh는 메시지를 약 12시간만 보관합니다.

## 알아둘 점

- ntfy.sh는 종단 간 암호화를 지원하지 않습니다([binwiederhier/ntfy#69](https://github.com/binwiederhier/ntfy/issues/69)). 그래서 본문은 맥락 없이는 의미가 없는 포인터로만 채웁니다.
- 예약 한도는 ntfy.sh 기본값 기준 10초~3일입니다.
- 예약한 push의 시각을 옮기거나 취소할 때는 지우지 않고, 같은 sequence id로 다시 발행합니다. 대기 중인 메시지는 서버에서 지워지고 새 메시지만 도착합니다. 취소할 때는 지연 없이 priority 1로 보냅니다. 휴대폰에는 소리와 진동 없는 알림 하나만 남습니다. 지우기(`ntfy_manage_message`)는 호출할 때마다 확인 창을 띄우기 때문에 쓰지 않습니다.
