# clawd-toggle-plugin

Toggle the clawd-on-desk Electron desktop pet for Claude Code.

- `npm start`: clawd-on-desk를 백그라운드 프로세스로 실행
- PID 파일(`/tmp/clawd-on-desk.pid`) 추적으로 토글 (caffeinate 방식과 동일)
- 종료 시 `npm → node → electron` 프로세스 그룹 전체 정리
- 로그: `/tmp/clawd-on-desk.log`

## Config

repo가 다른 경로에 있으면 환경변수로 지정:

```bash
export CLAWD_ON_DESK_DIR=/path/to/clawd-on-desk
```

기본값: `/Users/choi/Downloads/github/oss/clawd-on-desk`
