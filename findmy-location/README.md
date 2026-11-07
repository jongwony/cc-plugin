# findmy-location

Mac의 Find My 앱에서 지금 내 휴대폰(또는 지정한 보조 기기)의 위치를 읽어, Claude가 작업 컨텍스트로 쓰게 하는 플러그인입니다.

## 동작

1. 스크립트는 Find My의 기기 목록을 접근성(AX) 트리로 읽어, 목록 행의 텍스트만 화면에 보이는 그대로 JSON 한 줄(`rows`)로 돌려줍니다. 스크린샷은 찍지 않고, 행을 해석하지도 않습니다.
2. 행을 읽고 판단하는 것은 Claude입니다. 설정한 기기 이름으로 시작하는 행에서 장소, 이 Mac과의 거리, 얼마 전 위치인지를 읽습니다.
3. 위치가 `일시 정지됨`이거나 작업에 쓰기에 오래됐으면 `--refresh`로 한 번 더 읽습니다. Find My를 10초 동안 앞으로 가져와 갱신하게 한 뒤, 원래 앞에 있던 앱으로 돌립니다.
4. Mac이 잠겨 있으면 먼저 디스플레이를 켜서(`caffeinate -u`) Open Computer Use의 Locked Use가 Find My를 읽게 합니다. Locked Use가 연 세션은 Mac의 자동 잠금이 다시 닫습니다.

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

두 값은 스크립트가 아니라 skill 안내문에 들어가, Claude가 어느 행을 읽을지 정하는 데 씁니다.

필요한 것: macOS, Python 3, Open Computer Use 1.1.3 이상(`npm i -g open-computer-use`, 접근성 권한), Find My 로그인. Mac이 잠긴 동안 읽으려면 Locked Use(`ocu locked-use enable`)가 켜져 있어야 합니다.

## 한계

- 목록 행의 주소는 보통 시·동 수준입니다. 더 자세한 주소는 Find My에서 그 기기가 선택된 행(`세부사항 열기`가 들어 있는 행)에만 나옵니다.
- Find My가 한국어 화면일 때만 확인했습니다.

## 테스트

```
python3 -m unittest discover -s findmy-location/tests -v
```

행 텍스트를 걸러 내는 부분, 잠긴 Mac 처리, `--refresh`의 포커스 복귀, 오류 출력을 검사합니다. 실제 Find My를 읽는 경로는 테스트에 들어 있지 않습니다.
