# findmy-location

Mac의 Find My 앱에서 지금 내 휴대폰(또는 지정한 보조 기기)의 위치를 읽어, Claude가 작업 컨텍스트로 쓰게 하는 플러그인입니다. 장소 라벨, 주소, 이 Mac과의 거리, 그리고 그 위치가 얼마나 최신인지(`지금`, `N분 전`)를 JSON 한 줄로 돌려줍니다.

## 동작

1. Find My의 기기 목록을 접근성(AX) 트리로 읽습니다. 스크린샷은 찍지 않습니다.
2. 설정한 기기 중 위치가 최신인 첫 기기를 고릅니다.
3. 설정한 기기 중 최신 위치가 보이는 기기가 없으면(예: Find My가 백그라운드에서 위치를 `일시 정지됨`으로 둔 경우), Find My를 최대 15초 앞으로 가져와 갱신을 기다린 뒤 원래 앱으로 돌립니다.
4. 고른 기기 행에 주소가 없으면 그 행을 선택해 주소를 받습니다.

최신 위치가 없으면 `stale_or_missing`으로 끝나고, 예전 값을 대신 내놓지 않습니다. Find My를 읽지 못하면(접근성 권한 없음, ocu 실패·시간 초과) `error`와 이유를 돌려줍니다.

## 설치와 설정

```
/plugin install findmy-location --marketplace jongwony/cc-plugin
claude plugin configure findmy-location@cc-plugin --values-stdin <<'EOF'
{"primary_device": "<기기 이름>", "fallback_device": "<기기 이름>"}
EOF
```

값은 JSON 객체입니다. 기기 이름에는 `, `가 들어갈 수 없고, 이름 하나가 Find My 목록의 여러 행과 앞부분이 겹치면 그 기기는 건너뛰고 `ambiguous`로 알려 줍니다.

- `primary_device`: Find My 목록에 보이는 이름 그대로(보통 휴대폰)
- `fallback_device`: 휴대폰 위치가 최신이 아닐 때 읽을 기기(예: Apple Watch). 비워 둬도 됩니다.

필요한 것: macOS, Python 3, Open Computer Use 1.1.3 이상(`npm i -g open-computer-use`, 접근성 권한), Find My 로그인. Find My가 한국어 화면일 때만 확인했습니다.

## 테스트

```
python3 -m unittest discover -s findmy-location/tests -v
```

행 파서와 신선도 판정은 실제 AX 행 형식의 예시로, 대기·포커스 복귀·ocu 실패 처리는 ocu와 시계를 흉내 낸 테스트로 검사합니다. 실제 Find My를 읽는 경로는 테스트에 들어 있지 않습니다.
