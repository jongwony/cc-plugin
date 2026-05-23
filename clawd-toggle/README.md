# clawd-toggle-plugin

Toggle the clawd-on-desk Electron desktop pet for Claude Code.

- `npm start`: clawd-on-desk를 백그라운드 프로세스로 실행
- 실행 중인 electron 프로세스를 경로 시그니처(`$CLAWD_DIR/node_modules/electron`)로 `pgrep` 탐지해 토글
- 종료 시 `pkill`로 main + helper 프로세스 트리 전체 정리
- 로그: `/tmp/clawd-on-desk.log`

> PID 파일 추적을 쓰지 않는 이유: `npm start`는 부트스트랩만 하고 node 런처는 electron이 뜨면 종료되며, electron은 자기만의 프로세스 그룹으로 재분리됩니다. 런처 PID를 저장하면 즉시 stale 포인터가 되어 실제 트리를 종료하지 못합니다.

## Config

repo가 다른 경로에 있으면 환경변수로 지정:

```bash
export CLAWD_ON_DESK_DIR=/path/to/clawd-on-desk
```

기본값: `/Users/choi/Downloads/github/oss/clawd-on-desk`
