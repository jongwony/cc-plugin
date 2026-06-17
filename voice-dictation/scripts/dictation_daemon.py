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
import fcntl
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
# rec 녹음 포맷 — _wav_duration 의 크기→길이 산출이 이 값에 의존하므로
# 아래 rec 호출 인자와 반드시 일치해야 한다.
SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_BYTES = 2       # rec 기본 s16(16-bit signed) WAV
WAV_HEADER_BYTES = 44  # 표준 WAV 헤더 크기
WHISPER_MIN_TIMEOUT = 20.0    # 전사 타임아웃 하한(초)
WHISPER_TIMEOUT_FACTOR = 4.0  # 실제 오디오 길이 대비 타임아웃 배수
WAV = os.path.join(tempfile.gettempdir(), "voice_dictation.wav")
LOCK = os.path.join(tempfile.gettempdir(), "voice_dictation.lock")

_rec_proc = None
_recording = False
_lock_fp = None        # 단일 인스턴스 락 fd — 프로세스 수명 동안 열어 둬 락 유지


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
        ["rec", "-q", "-r", str(SAMPLE_RATE), "-c", str(CHANNELS), WAV],
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

    timeout = max(WHISPER_MIN_TIMEOUT, dur * WHISPER_TIMEOUT_FACTOR)
    print(f"  전사 중… ({dur:.1f}s, 타임아웃 {timeout:.0f}s)", flush=True)
    t0 = time.time()
    text = _transcribe(WAV, timeout)
    dt = time.time() - t0
    if not text:
        print("  (빈 결과)", flush=True)
        return
    print(f"  ⤷ ({dt:.1f}s) {text}", flush=True)
    _inject(text)


def _wav_duration(path):
    """녹음 길이(초)를 파일 크기에서 직접 산출 — 헤더 손상에 면역.

    이전 구현은 ffprobe 로 WAV 헤더의 duration 을 읽었는데, rec(sox) 가
    SIGINT 종료 시 헤더를 finalize 하지 못하면(간헐적) 헤더에 sentinel
    거대값이 남아 실제 수 초짜리 녹음이 수 시간으로 잘못 읽혔다. 그 값이
    MIN_SEC '너무 짧으면 무시' 가드를 통과해 whisper 가 폭주했다. 데몬은
    고정 포맷(SAMPLE_RATE/CHANNELS/SAMPLE_BYTES)으로만 녹음하므로, 디스크에
    실제로 쓰인 바이트 수가 길이의 신뢰 가능한 근거다.
    """
    try:
        size = os.path.getsize(path)
    except OSError:
        return 0.0
    data_bytes = max(0, size - WAV_HEADER_BYTES)
    return data_bytes / (SAMPLE_RATE * CHANNELS * SAMPLE_BYTES)


def _transcribe(path, timeout):
    cmd = [WHISPER_CLI, "-m", MODEL, "-f", path, "-l", LANG, "-nt", "-np"]
    if PROMPT:
        cmd += ["--prompt", PROMPT]
    try:
        out = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        # 손상 WAV 등으로 전사가 무한정 길어지는 폭주를 차단 — run() 은
        # 타임아웃 시 자식 프로세스를 종료(kill)한다.
        print(f"  (전사 타임아웃 {timeout:.0f}s 초과 — 중단)", flush=True)
        return ""
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


def _acquire_singleton_lock():
    """단일 인스턴스 보장 — 이미 다른 데몬이 락을 쥐고 있으면 즉시 종료.

    advisory flock 은 프로세스 종료/크래시 시 OS 가 자동 해제하므로 stale PID
    파일 문제가 없다. 락 fd 를 전역에 보관해 프로세스 수명 동안 락을 유지하며,
    런처·플러그인 버전·시그니처와 무관하게 중복 기동 자체를 차단한다.
    """
    global _lock_fp
    _lock_fp = open(LOCK, "w")
    try:
        fcntl.flock(_lock_fp.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        raise SystemExit("이미 실행 중인 voice-dictation 데몬이 있습니다 — 중복 기동 취소.")


def main():
    _acquire_singleton_lock()
    if not os.path.exists(MODEL):
        raise SystemExit(f"모델 없음: {MODEL}")
    print("voice-dictation 프로토타입 — 오른쪽 Option(⌥) 홀드로 받아쓰기. 중지: Ctrl+C")
    print(f"  모델: {os.path.basename(MODEL)} | 언어: {LANG}")
    print("  (첫 전사는 모델 콜드 로드로 다소 느릴 수 있음)")
    with keyboard.Listener(on_press=_on_press, on_release=_on_release) as listener:
        listener.join()


if __name__ == "__main__":
    main()
