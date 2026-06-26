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
import glob
import os
import queue
import signal
import struct
import subprocess
import tempfile
import threading
import time

from pynput import keyboard

# ── 설정 (벤치마크로 검증된 기본값) ──
MODEL = os.path.expanduser("~/whisper-models/ggml-large-v3-turbo-q5_0.bin")
WHISPER_CLI = "whisper-cli"
LANG = "auto"          # ko / en / auto
# whisper 의 initial prompt — '명령'이 아니라 '편향'(soft bias, 약 224 토큰 상한).
# 특정 용어를 나열하면 그 단어가 실제 발화에 없어도 출력에 끼어드는(hallucination)
# 위험이 있어, 어휘 예시는 비운다. 대신 프롬프트 자체를 한국어+영문 혼합 스크립트로
# 둬, 특정 어휘를 가리키지 않고 code-switching(영어 단어는 영문 그대로)만 구조적으로
# 편향한다. 언어 선택은 LANG=auto 가 발화별로 담당하고(한/영 어느 쪽으로 말하든),
# 이 프롬프트는 표기 스타일만 기울인다. 문법 교정·재작성은 이 층위로 불가(LLM 몫).
PROMPT = "한국어와 English가 섞인 받아쓰기."
TRIGGER = keyboard.Key.alt_r   # 오른쪽 Option
MIN_SEC = 0.3          # 이보다 짧은 녹음은 오발화로 간주, 무시
# rec 녹음 포맷 — whisper 친화적인 컴팩트 s16 PCM 으로 고정한다. _wav_duration
# 은 더 이상 이 값에 의존하지 않고(WAV `fmt ` 청크에서 실제 포맷을 읽음) 포맷이
# 드리프트해도 길이가 조용히 틀어지지 않으므로, 아래 -b/-e 고정은 정확성의
# 근거가 아니라 파일 크기 절감용 best-effort 다(미반영돼도 길이는 정확).
SAMPLE_RATE = 16000
CHANNELS = 1
SAMPLE_BYTES = 2       # rec -b 16 -e signed-integer 선호 포맷 s16(16-bit signed)
# 전사 타임아웃 하한 — whisper-cli 는 매 호출 fresh 프로세스라 모델 콜드 로드 +
# Metal 셰이더 컴파일(첫 호출 수십 초 가능) 비용을 짧은 발화에서도 흡수해야 한다.
WHISPER_MIN_TIMEOUT = 40.0
WHISPER_TIMEOUT_FACTOR = 4.0  # 실제 오디오 길이 대비 타임아웃 배수
WAV = os.path.join(tempfile.gettempdir(), "voice_dictation.wav")
LOCK = os.path.join(tempfile.gettempdir(), "voice_dictation.lock")

_rec_proc = None
_recording = False
_lock_fp = None        # 단일 인스턴스 락 fd — 프로세스 수명 동안 열어 둬 락 유지
_transcribe_q = queue.Queue()  # (snapshot, dur) FIFO 큐 — 단일 consumer 워커가 순서대로 전사
_wav_seq = 0           # WAV 스냅샷 고유 카운터(리스너 단일 스레드에서만 증가)


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
    # mono s16, 장치 네이티브 샘플레이트로 캡처 — -r 을 강제하지 *않는다*.
    # AirPods 등 블루투스(HFP) 입력의 네이티브는 24kHz인데 -r 16000 을 강제하면
    # SoX coreaudio 경로의 리샘플이 스트림을 잡음으로 손상시킨다(같은 AirPods를
    # 네이티브 레이트로 받는 정상 앱에선 깨끗). whisper-cli 가 임의 입력 레이트를
    # 내부에서 16kHz 로 리샘플하므로 네이티브 캡처를 그대로 넘기면 된다. -b/-e 는
    # 컴팩트 s16 선호 요청일 뿐(정확성용 아님 — _wav_duration 이 `fmt ` 청크에서
    # 실제 포맷을 읽음). SIGINT 으로 종료해야 sox 가 WAV 헤더를 정상 finalize 함.
    _rec_proc = subprocess.Popen(
        ["rec", "-q", "-b", str(SAMPLE_BYTES * 8), "-e", "signed-integer",
         "-c", str(CHANNELS), WAV],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print("● 녹음…", flush=True)


def _stop_and_transcribe():
    global _rec_proc, _recording, _wav_seq
    if not _recording:
        return
    _recording = False
    if _rec_proc is not None:
        _rec_proc.send_signal(signal.SIGINT)
        try:
            _rec_proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            _rec_proc.kill()
            _rec_proc.wait()   # SIGKILL 후 reap — 미종료 writer 의 파일을 전사하지 않게
        _rec_proc = None

    # 오발화(짧은 brush)는 스냅샷·스레드를 만들기 전에 리스너 스레드에서 바로 거른다
    # — 무의미한 워커가 쌓이지 않게. _wav_duration 은 헤더 청크만 읽어 즉시 반환된다.
    dur = _wav_duration(WAV)
    if dur < MIN_SEC:
        print(f"  (무시: {dur:.2f}s)", flush=True)
        return

    # WAV 를 고유 스냅샷으로 옮긴 뒤 전사를 FIFO 큐에 넣는다. 두 가지를 동시에
    # 해결한다: (1) pynput 리스너 콜백 스레드를 즉시 풀어, 전사(최대 timeout 초)
    # 동안 다음 키 입력·녹음이 막히거나 macOS 이벤트 탭이 비활성화되지 않게 한다.
    # (2) 다음 녹음이 같은 WAV 경로를 덮어써 전사 중인 파일을 훼손하는 race 를 막는다.
    _wav_seq += 1
    snapshot = f"{WAV}.{_wav_seq}"
    try:
        os.replace(WAV, snapshot)
    except OSError:
        # rec 가 파일을 못 만든 경우(장치 점유/권한 오류 등) — 조용히 종료
        return
    _transcribe_q.put((snapshot, dur))


def _transcribe_worker():
    # 단일 consumer 워커(데몬). 큐에서 순서대로(FIFO) 꺼내 한 번에 하나씩 전사·주입
    # 하므로 발화 순서가 보존되고, 워커 스레드는 프로세스 전체에 정확히 하나만 존재한다.
    # 한 전사의 예외가 워커(=전체 파이프라인)를 죽이지 않도록 폭넓게 잡아 로깅만 한다.
    while True:
        path, dur = _transcribe_q.get()
        try:
            timeout = max(WHISPER_MIN_TIMEOUT, dur * WHISPER_TIMEOUT_FACTOR)
            print(f"  전사 중… ({dur:.1f}s, 타임아웃 {timeout:.0f}s)", flush=True)
            t0 = time.time()
            text = _transcribe(path, timeout)
            dt = time.time() - t0
            if not text:
                print("  (빈 결과)", flush=True)
                continue
            print(f"  ⤷ ({dt:.1f}s) {text}", flush=True)
            _inject(text)
        except Exception as exc:
            print(f"  (전사 오류 — 건너뜀: {exc})", flush=True)
        finally:
            try:
                os.remove(path)
            except OSError:
                pass


def _read_wav_format(path):
    """WAV `fmt ` 청크에서 (nSamplesPerSec, bytes_per_frame, header_len) 산출.

    파싱 실패 시 None. `fmt ` 청크는 sox 가 녹음 *시작* 시점에 기록하므로,
    SIGINT 중단이 파일 끝의 data 청크 size 필드를 손상시켜도 온전하다(과거
    ffprobe 경로가 깨진 이유가 바로 그 끝부분 size/duration 필드를 믿었기
    때문). 여기서는 손상될 수 있는 data 청크 size 는 읽지 않고, 데이터가
    시작되는 오프셋(header_len)과 실제 포맷만 얻는다 — 길이는 호출부에서
    파일 크기 기준으로 계산한다.

    stdlib `wave` 대신 직접 파싱: `wave` 는 WAVE_FORMAT_EXTENSIBLE 헤더나
    손상된 data size 에서 예외를 던질 수 있는 반면, 여기 필요한 필드(포맷,
    data 오프셋)만 읽는 최소 파서는 그런 입력에도 견고하고 의존성도 없다.
    """
    try:
        with open(path, "rb") as f:
            riff = f.read(12)
            if len(riff) < 12 or riff[0:4] != b"RIFF" or riff[8:12] != b"WAVE":
                return None
            sample_rate = n_channels = bits_per_sample = header_len = None
            while True:
                chunk_hdr = f.read(8)
                if len(chunk_hdr) < 8:
                    break
                chunk_id, chunk_size = struct.unpack("<4sI", chunk_hdr)
                if chunk_id == b"fmt ":
                    fmt = f.read(chunk_size)
                    if len(fmt) < 16:
                        return None
                    # 오프셋 2: nChannels(H), 4: nSamplesPerSec(I), 14: wBitsPerSample(H).
                    # EXTENSIBLE(0xFFFE) 도 이 세 필드 위치는 동일하다.
                    n_channels, sample_rate = struct.unpack("<HI", fmt[2:8])
                    bits_per_sample = struct.unpack("<H", fmt[14:16])[0]
                    if chunk_size & 1:   # 워드 정렬 패딩 바이트
                        f.read(1)
                elif chunk_id == b"data":
                    # 오디오 바이트가 시작되는 오프셋. data 청크 size(손상 가능)는
                    # 읽지 않고 여기서 멈춘다 — 손상된 size 로 전진하지 않게.
                    header_len = f.tell()
                    break
                else:
                    f.seek(chunk_size + (chunk_size & 1), 1)
            if (sample_rate is None or n_channels is None
                    or bits_per_sample is None or header_len is None):
                return None
            bytes_per_frame = (bits_per_sample // 8) * n_channels
            if sample_rate <= 0 or bytes_per_frame <= 0:
                return None
            return sample_rate, bytes_per_frame, header_len
    except OSError:
        return None


def _wav_duration(path):
    """녹음 길이(초)를 파일 크기 + 실제 포맷에서 산출 — 헤더 손상에 면역.

    이전 구현은 ffprobe 로 WAV 헤더의 duration 을 읽었는데, rec(sox) 가
    SIGINT 종료 시 헤더를 finalize 하지 못하면(간헐적) 헤더에 sentinel
    거대값이 남아 실제 수 초짜리 녹음이 수 시간으로 잘못 읽혔다. 그 값이
    MIN_SEC '너무 짧으면 무시' 가드를 통과해 whisper 가 폭주했다.

    길이는 디스크에 실제로 쓰인 바이트 수에서 산출한다(손상되는 끝부분 size
    필드가 아님). 바이트→길이 변환에 필요한 포맷(샘플레이트·프레임 바이트)과
    헤더 길이는 시작 시점에 기록돼 온전한 `fmt ` 청크에서 읽으므로, rec 포맷
    고정이 미반영돼도(예: 장치 기본 32-bit/EXTENSIBLE) 길이가 틀어지지 않는다.
    """
    fmt = _read_wav_format(path)
    if fmt is None:
        return 0.0
    sample_rate, bytes_per_frame, header_len = fmt
    try:
        size = os.path.getsize(path)
    except OSError:
        return 0.0
    data_bytes = max(0, size - header_len)
    return data_bytes / (sample_rate * bytes_per_frame)


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


def _warmup():
    """첫 발화의 콜드 스타트(모델 페이지캐시 적재 + Metal 파이프라인 컴파일,
    수십 초까지 가능)를 데몬 기동 시점으로 옮긴다. 마이크를 쓰지 않고 sox -n 으로
    0.5s 저음량 톤 WAV 를 합성해 _transcribe 와 동일 경로로 한 번 돌려 모델·Metal
    캐시를 예열한다. 이후 매 fresh whisper-cli 프로세스가 그 캐시를 재사용하므로
    사용자의 첫 발화가 곧장 정상 속도로 응답한다 — 콜드 콜이 끝날 때까지 후속
    발화가 단일 워커 큐에 쌓였다가 한꺼번에 밀려드는 현상이 사라진다. 워밍업은
    best-effort: 실패해도 데몬 동작에 영향이 없으므로 조용히 넘어간다."""
    warm_wav = os.path.join(tempfile.gettempdir(), "voice_dictation_warmup.wav")
    try:
        # sox -n: 장치(마이크) 없이 합성 입력. rec 와 동일한 16kHz mono s16 포맷의
        # 짧은 톤 — 인코더/디코더 경로를 거쳐 Metal 파이프라인을 데운다.
        subprocess.run(
            ["sox", "-n", "-q", "-b", str(SAMPLE_BYTES * 8), "-e", "signed-integer",
             "-r", str(SAMPLE_RATE), "-c", str(CHANNELS), warm_wav,
             "synth", "0.5", "sine", "440", "vol", "0.02"],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        print("  워밍업 중… (모델·Metal 캐시 예열, 첫 발화 지연 제거)", flush=True)
        t0 = time.time()
        _transcribe(warm_wav, WHISPER_MIN_TIMEOUT)
        print(f"  준비 완료 ({time.time() - t0:.1f}s)", flush=True)
    except Exception as exc:
        print(f"  (워밍업 건너뜀: {exc})", flush=True)
    finally:
        try:
            os.remove(warm_wav)
        except OSError:
            pass


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
    # 이전 비정상 종료(전사 중 프로세스 kill)로 남은 전사 스냅샷 정리. 단일 인스턴스
    # 락 획득 후이므로 다른 인스턴스의 진행 중 스냅샷을 건드리지 않는다.
    for stale in glob.glob(f"{WAV}.*"):
        try:
            os.remove(stale)
        except OSError:
            pass
    if not os.path.exists(MODEL):
        raise SystemExit(f"모델 없음: {MODEL}")
    print("voice-dictation 프로토타입 — 오른쪽 Option(⌥) 홀드로 받아쓰기. 중지: Ctrl+C")
    print(f"  모델: {os.path.basename(MODEL)} | 언어: {LANG}")
    print("  (기동 직후 백그라운드 워밍업으로 첫 발화 지연을 제거합니다)")
    threading.Thread(target=_transcribe_worker, daemon=True).start()
    # 콜드 스타트 비용을 백그라운드 기동 시점으로 흡수 — 키 리스너는 즉시 활성.
    threading.Thread(target=_warmup, daemon=True).start()
    with keyboard.Listener(on_press=_on_press, on_release=_on_release) as listener:
        listener.join()


if __name__ == "__main__":
    main()
