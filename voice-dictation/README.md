# voice-dictation-plugin

Push-to-talk voice dictation for Claude Code, powered by whisper.cpp.

- Hold **Right Option (⌥)** to record; release to transcribe and paste into the active window
- 엔진: whisper.cpp `large-v3-turbo` (`whisper-cli`), 녹음은 `rec`
- 받아쓴 텍스트는 클립보드 + `Cmd+V`로 frontmost 앱에 붙여넣기
- 토글: 실행 중인 데몬을 스크립트 경로 시그니처(`dictation_daemon.py`)로 `pgrep` 탐지해 on/off
- 로그: `/tmp/voice-dictation.log`

> `uv run`은 자식 python 프로세스로 재분리되어 런처 PID가 stale 포인터가 되므로, PID 파일 대신 on-disk 스크립트 경로 시그니처로 `pgrep`/`pkill` 합니다 (clawd-toggle과 동일).

## Requirements (CLI)

데몬 실행 전 다음 CLI가 PATH에 있어야 합니다:

- `whisper-cli` (brew `whisper-cpp`) — 전사
- `rec` (brew `sox`) — 녹음 (`-b 16 -e signed-integer -r 16000 -c 1` 컴팩트 s16 선호; 녹음 길이는 WAV `fmt ` 청크의 실제 포맷으로 파일 크기에서 산출하므로 ffprobe 불필요, 포맷 미반영에도 정확)
- `uv` — 데몬 실행

## Permissions (macOS, one-time)

토글을 실행하는 터미널 앱에 다음 권한을 부여하세요. 부여 후 데몬을 다시 토글합니다.

- **Microphone** — 오디오 녹음
- **Input Monitoring** — Right Option(⌥) hold 감지
- **Accessibility** — 활성 창에 붙여넣기

## Model

모델 파일이 다음 경로에 있어야 합니다:

```
~/whisper-models/ggml-large-v3-turbo-q5_0.bin
```
