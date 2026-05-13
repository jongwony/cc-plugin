---
name: cdp-bootstrap
description: |
  This skill should be used when the user explicitly asks to
  "bootstrap CDP on Linux", "start Chromium for cdp-attach on a headless box",
  "set up Xvfb for CDP", or "make cdp-attach work in this sandbox".
  Launches Playwright-bundled Chromium under Xvfb with --remote-debugging-port
  so the existing cdp-attach skill passes its headed-browser guard. Linux-only;
  user-invoked only (does not auto-trigger from cdp-attach errors).
user_invocable: true
argument-hint: "[--port N] [--display N] [--chrome PATH]"
---

# cdp-bootstrap

Headless-Linux sandbox에서 cdp-attach 가 동작할 수 있도록 가시-디스플레이 Chromium 인스턴스를 띄운다. 라이프사이클은 **start 전용** — 종료/재시작은 사용자 책임.

## Scope

**WILL**
- Xvfb 가상 디스플레이를 띄우고 그 위에 Playwright 번들 Chromium 을 `--remote-debugging-port` 와 함께 기동
- `/json/version` 도달 가능까지 폴링
- 다음 단계 hint (`v1 select 0`) 출력

**WILL NOT**
- `--headless=new` 로 가드 우회 (실제 가시성 없음 → 정책 위배)
- Xvfb/Chromium 종료/재시작 (`pkill -f` 로 수동 처리)
- macOS 에서 실행 (cdp-attach 자체 launch 명령 사용)
- 패키지 설치 (xvfb, uv, chromium 없으면 abort)

## Execution

```bash
bash "${CLAUDE_PLUGIN_ROOT}/.claude/skills/cdp-bootstrap/scripts/bootstrap.sh"
bash "${CLAUDE_PLUGIN_ROOT}/.claude/skills/cdp-bootstrap/scripts/bootstrap.sh" --port 9333 --display 100
bash "${CLAUDE_PLUGIN_ROOT}/.claude/skills/cdp-bootstrap/scripts/bootstrap.sh" --chrome /opt/google/chrome/chrome
```

> 이 skill 은 프로젝트 로컬(`.claude/skills/`) 위치에서 실행됨. `${CLAUDE_PLUGIN_ROOT}` 대신 프로젝트 루트 기준 경로로 호출해도 됨:
> ```bash
> bash .claude/skills/cdp-bootstrap/scripts/bootstrap.sh
> ```

## Preflight Checks

부트스트랩이 fail-fast 하는 다섯 가지:

| Check | Failure |
|---|---|
| `uname -s` == Linux | "macOS — use cdp-attach's native launch" |
| `command -v Xvfb` | "apt install xvfb" hint |
| `command -v uv` | uv 설치 안내 |
| Chromium 바이너리 발견 (`--chrome` 또는 `/opt/pw-browsers/.../chrome`) | "set --chrome PATH" |
| 포트 비어 있음 (curl /json/version 실패) | 200 응답 시 idempotent skip → exit 0 |

## Idempotency

`curl -sf http://127.0.0.1:${PORT}/json/version` 가 200 을 반환하면 **아무것도 하지 않고 exit 0**. 이미 동작 중인 인스턴스를 보호한다.

## Verification

부트스트랩 성공 후 cdp-attach 작동을 확인:

```bash
V1="uv run --quiet --script ${CLAUDE_PLUGIN_ROOT}/cdp-attach/scripts/v1_core.py"
$V1 select 0
$V1 doctor
```

`v1 doctor` 가 7/7 PASS 면 종료. 실패 항목이 있으면 `/tmp/chrome-logs/{xvfb,chrome}.log` 마지막 50줄 확인.

## Invocation Note (cdp-attach scripts)

`cdp-attach/scripts/*.py` shebang 은 `#!/usr/bin/env uv run --quiet --script` 형태인데, Linux `env` 는 `-S` 없이 다중 인자를 분해하지 못한다. 직접 실행 대신 다음 형태로 호출:

```bash
uv run --quiet --script "${CLAUDE_PLUGIN_ROOT}/cdp-attach/scripts/v1_core.py" <subcommand>
```

영구 수정 (`env -S` 추가) 은 cdp-attach 측 별도 커밋으로 처리.

## Argument Dispatch

| Arg | Default | Effect |
|---|---|---|
| `--port N` | `9222` | `--remote-debugging-port=N` |
| `--display N` | `99` | Xvfb `:N`; 이미 떠 있으면 Xvfb 단계 skip |
| `--chrome PATH` | `/opt/pw-browsers/chromium-*/chrome-linux/chrome` 자동 검색 | Chromium 바이너리 override |

## State

- Xvfb log: `/tmp/chrome-logs/xvfb.log`
- Chromium log: `/tmp/chrome-logs/chrome.log`
- Chromium profile: `/tmp/chrome-profile/` (재시작 간 유지)
- CDP endpoint: `http://127.0.0.1:9222/json/version`
