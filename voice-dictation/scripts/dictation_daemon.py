#!/usr/bin/env uv run --quiet --script
# /// script
# requires-python = ">=3.8"
# dependencies = ["pynput>=1.7"]
# ///
"""voice-dictation 프로토타입 데몬 — 오른쪽 Option(⌥) 홀드 푸시투토크.

누르는 동안 녹음 → 떼면 whisper.cpp 전사 → 현재 활성창에 클립보드 paste.

필요 권한 (이 스크립트를 띄운 터미널 앱에 부여):
- Microphone        : rec 녹음
- Input Monitoring  : pynput 전역 키 감지
- Accessibility     : osascript Cmd+V 합성

중지: Ctrl+C
"""
import os
import signal
import subprocess
import tempfile
import time

from pynput import keyboard

# ── 설정 (벤치마크로 검증된 기본값) ──
MODEL = os.path.expanduser("~/whisper-models/ggml-large-v3-turbo-q5_0.bin")
WHISPER_CLI = "whisper-cli"
LANG = "auto"          # ko / en / auto
PROMPT = "whisper, hotkey, active window, transcription, paste, 데몬, 핫키, 단축키, 음성 전사"
TRIGGER = keyboard.Key.alt_r   # 오른쪽 Option
MIN_SEC = 0.3          # 이보다 짧은 녹음은 오발화로 간주, 무시
WAV = os.path.join(tempfile.gettempdir(), "voice_dictation.wav")

_rec_proc = None
_recording = False


def _start_recording():
    global _rec_proc, _recording
    if _recording:
        return
    _recording = True
    # 이전 녹음 파일을 먼저 제거 — rec 가 새 파일을 못 쓰는 상황(장치 점유/권한 오류)
    # 에서 직전 녹음을 stale 하게 전사·붙여넣기 하는 것을 방지.
    try:
        os.remove(WAV)
    except FileNotFoundError:
        pass
    # 16kHz mono. SIGINT 으로 종료해야 sox 가 WAV 헤더를 정상 finalize 함.
    _rec_proc = subprocess.Popen(
        ["rec", "-q", "-r", "16000", "-c", "1", WAV],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print("● 녹음…", flush=True)


def _stop_and_transcribe():
    global _rec_proc, _recording
    if not _recording:
        return
    _recording = False
    if _rec_proc is not None:
        _rec_proc.send_signal(signal.SIGINT)
        try:
            _rec_proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            _rec_proc.kill()
        _rec_proc = None

    dur = _wav_duration(WAV)
    if dur < MIN_SEC:
        print(f"  (무시: {dur:.2f}s)", flush=True)
        return

    print(f"  전사 중… ({dur:.1f}s)", flush=True)
    t0 = time.time()
    text = _transcribe(WAV)
    dt = time.time() - t0
    if not text:
        print("  (빈 결과)", flush=True)
        return
    print(f"  ⤷ ({dt:.1f}s) {text}", flush=True)
    _inject(text)


def _wav_duration(path):
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", path],
            capture_output=True, text=True,
        ).stdout.strip()
        return float(out)
    except Exception:
        return 0.0


def _transcribe(path):
    cmd = [WHISPER_CLI, "-m", MODEL, "-f", path, "-l", LANG, "-nt", "-np"]
    if PROMPT:
        cmd += ["--prompt", PROMPT]
    out = subprocess.run(cmd, capture_output=True, text=True)
    return " ".join(out.stdout.split()).strip()


def _inject(text):
    # 기존 클립보드 보존 → 새 텍스트 복사 → Cmd+V → 잠시 후 복원
    old = subprocess.run(["pbpaste"], capture_output=True, text=True).stdout
    subprocess.run(["pbcopy"], input=text, text=True)
    # key code 9 (물리 V 키)로 Cmd+V 합성. keystroke "v" 는 문자 'v'를 현재 입력
    # 소스를 통해 키코드로 번역하는데, 한글 IME 활성 시 'v' 매핑이 없어 키스트로크가
    # 드롭되어 붙여넣기가 실패함. key code 는 물리 키를 직접 지정해 입력 소스에 무관.
    subprocess.run([
        "osascript", "-e",
        'tell application "System Events" to key code 9 using command down',
    ])
    time.sleep(0.3)
    subprocess.run(["pbcopy"], input=old, text=True)


def _on_press(key):
    if key == TRIGGER:
        _start_recording()


def _on_release(key):
    if key == TRIGGER:
        _stop_and_transcribe()


def main():
    if not os.path.exists(MODEL):
        raise SystemExit(f"모델 없음: {MODEL}")
    print("voice-dictation 프로토타입 — 오른쪽 Option(⌥) 홀드로 받아쓰기. 중지: Ctrl+C")
    print(f"  모델: {os.path.basename(MODEL)} | 언어: {LANG}")
    print("  (첫 전사는 모델 콜드 로드로 다소 느릴 수 있음)")
    with keyboard.Listener(on_press=_on_press, on_release=_on_release) as listener:
        listener.join()


if __name__ == "__main__":
    main()
