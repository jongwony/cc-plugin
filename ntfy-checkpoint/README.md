# ntfy-checkpoint

정해진 분(minute)에 한 번 확인해야 하는 일을, 미리 ntfy에 예약해 두었다가 그 시각에 휴대폰으로 받는 플러그인입니다. 예약된 목록이 캘린더나 미리 알림에 보이지 않고, 메시지에는 무엇을 확인할지 한 줄과 나머지를 찾아갈 세션 id만 담깁니다.

- 30분 이상 블록 → 캘린더
- Claude의 완료·입력 대기 알림 → Claude Code 알림 (섞이지 않게)
- 분 단위 일회성 확인 → 이 플러그인

## 구성

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

## 알아둘 점

- ntfy.sh는 종단 간 암호화를 지원하지 않습니다([binwiederhier/ntfy#69](https://github.com/binwiederhier/ntfy/issues/69)). 그래서 본문은 맥락 없이는 의미가 없는 포인터로만 채웁니다.
- 예약 한도는 ntfy.sh 기본값 기준 10초~3일입니다.
