# findmy-location

Mac의 Find My 앱에서 지금 내 휴대폰(또는 지정한 보조 기기)의 위치를 읽어, Claude가 작업 컨텍스트로 쓰게 하는 플러그인입니다.

## 동작

1. 스크립트는 Find My의 기기 목록을 접근성(AX) 트리로 읽어, 목록 행의 텍스트만 화면에 보이는 그대로 JSON 한 줄(`rows`)로 돌려줍니다. 스크린샷은 찍지 않고, 행을 해석하지도 않습니다.
2. 행을 읽고 판단하는 것은 Claude입니다. 설정한 기기 이름으로 시작하는 행에서 장소, 이 Mac과의 거리, 얼마 전 위치인지를 읽습니다.
3. 한 번 읽을 때마다 Find My를 켜고, 읽고, 끄는 과정을 한 묶음으로 처리합니다. Find My를 쓰는 세션은 한 번에 하나뿐입니다. 다른 세션이 쓰는 중이면 끝날 때까지 최대 180초 기다립니다. 이 순서는 `~/Library/Caches/findmy-location/session.lock` 파일의 잠금(flock)으로 지킵니다. 잠금을 가진 프로세스가 죽으면 운영체제가 잠금을 풀어 주고, 남아 있던 Find My는 다음 실행이 끝날 때 종료합니다.
4. Find My가 꺼져 있다가 새로 켜진 경우(`cold_start: true`)에는 앞에 띄워 둔 채로 2초마다 다시 읽습니다. 주 기기 행이 `일시 정지됨`이나 `발견된 위치 없음`이 아닌 위치를 보이면 멈추고, 최대 30초까지 기다립니다. 결과는 `fresh`(true/false)로 알려 줍니다. 그다음 원래 앞에 있던 앱으로 돌립니다. 그래도 위치가 `일시 정지됨`이거나 작업에 쓰기에 오래됐으면 `--refresh`로 한 번 더 읽습니다.
5. Mac이 잠겨 있으면 먼저 디스플레이를 켜서(`caffeinate -u`) Open Computer Use의 Locked Use가 Find My를 읽게 합니다. Locked Use가 연 세션은 Mac의 자동 잠금이 다시 닫습니다.

Find My를 읽지 못하면(접근성 권한 없음, ocu 실패·시간 초과, Locked Use 없이 잠긴 Mac) `status: error`와 이유를 돌려줍니다.

## 설치와 설정

```
/plugin install findmy-location --marketplace jongwony/cc-plugin
claude plugin configure findmy-location@cc-plugin --values-stdin <<'FINDMY_LOCATION_CONFIG_END'
{"primary_device": "<기기 이름>", "fallback_device": "<기기 이름>"}
FINDMY_LOCATION_CONFIG_END
```

- `primary_device`: Find My 목록에 보이는 이름 그대로(보통 휴대폰)
- `fallback_device`: 휴대폰 위치가 최근 것이 아닐 때 읽을 기기(예: Apple Watch). 비워 둬도 됩니다.

`primary_device`는 skill 안내문이 스크립트에 `--device`로 넘깁니다. 스크립트는 이 값으로 위치가 갱신될 때까지 기다립니다. `--device` 없이 실행하면 10초만 기다리고 `fresh`는 `null`입니다. 두 값 모두 Claude가 어느 행을 읽을지 정하는 데도 씁니다.

필요한 것: macOS, Python 3, Open Computer Use 1.1.3 이상(`npm i -g open-computer-use`, 접근성 권한), Find My 로그인. Mac이 잠긴 동안 읽으려면 Locked Use(`ocu locked-use enable`)가 켜져 있어야 합니다.

## 한계

- 목록 행의 주소는 보통 시·동 수준입니다. 더 자세한 주소는 Find My에서 그 기기가 선택된 행(`세부사항 열기`가 들어 있는 행)에만 나옵니다.
- Find My가 한국어 화면일 때만 확인했습니다.

## 테스트

```
python3 -m unittest discover -s findmy-location/tests -v
```

행 텍스트를 걸러 내는 부분, 잠긴 Mac 처리, `--refresh`의 포커스 복귀, 켜고·읽고·끄는 과정과 세션 간 잠금, 오류 출력을 검사합니다. 실제 Find My를 읽는 경로는 테스트에 들어 있지 않습니다.
