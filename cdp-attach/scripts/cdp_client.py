"""
CDP Client — Shared module for direct Chrome DevTools Protocol communication.

Bypasses Puppeteer to avoid frozen-tab timeouts. Uses:
- HTTP API (urllib.request) for tab discovery (immune to frozen tabs)
- Per-tab WebSocket (websocket-client) for CDP commands

Runtime — Python + uv (not Node). Benchmarked 2026-04-21 on /json/list:
  uv run + stdlib urllib  → p50 67ms
  node v25 + fetch        → p50 90ms  (+46%)
Per-invocation bottleneck is WebSocket re-handshake, not language. A
daemon would help; a language swap would not. See CLAUDE.md project-wide
"Python Script Convention" rule before reconsidering.

Import via sys.path manipulation in v1/v2/v3 scripts:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from cdp_client import CDPClient
"""

import contextlib
import fcntl
import json
import os
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request

# State file location
STATE_DIR = os.path.expanduser("~/.cache/cdp-attach")
STATE_FILE = os.path.join(STATE_DIR, "state.json")
ERRORS_FILE = os.path.join(STATE_DIR, "errors.jsonl")
ERRORS_ROTATE_BYTES = 1024 * 1024  # 1MB


def _log_error(category, payload):
    """Append an error event to ~/.cache/cdp-attach/errors.jsonl.

    Best-effort: never raises. Disabled when CDP_ATTACH_NO_ERROR_LOG=1.
    Rotates errors.jsonl -> errors.jsonl.1 when size exceeds ERRORS_ROTATE_BYTES.
    """
    if os.environ.get("CDP_ATTACH_NO_ERROR_LOG") == "1":
        return
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        try:
            if os.path.getsize(ERRORS_FILE) > ERRORS_ROTATE_BYTES:
                os.replace(ERRORS_FILE, ERRORS_FILE + ".1")
        except FileNotFoundError:
            pass
        entry = {"t": time.time(), "category": category, **payload}
        with open(ERRORS_FILE, "a") as f:
            f.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")
    except Exception:
        # Logger must never break the caller.
        pass


class CDPError(Exception):
    """CDP protocol or connection error."""
    pass


class CDPConnectionError(CDPError):
    """Transport-level failure (WebSocket send/recv), as opposed to a CDP
    method error. Best-effort handlers that swallow CDPError for individual
    method failures must re-raise this — a dead connection cannot recover
    by continuing to the next call."""
    pass


class CDPClient:
    """Direct CDP client using HTTP discovery + per-tab WebSocket."""

    def __init__(self, host=None, port=None):
        self.host = host or os.environ.get("CDP_HOST", "127.0.0.1")
        self.port = int(port or os.environ.get("CDP_PORT", "9222"))
        self._base_url = f"http://{self.host}:{self.port}"
        self._ws = None
        self._msg_id = 0
        self._event_buffer = []

    # ── HTTP API (frozen-tab immune) ──────────────────────────────

    def _http_get(self, path):
        """GET request to CDP HTTP endpoint."""
        url = f"{self._base_url}{path}"
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                try:
                    return json.loads(resp.read())
                except json.JSONDecodeError:
                    raise CDPError(f"Invalid JSON response from CDP endpoint: {path}")
        except urllib.error.URLError as e:
            raise CDPError(f"CDP HTTP endpoint unreachable ({self._base_url}): {e}")

    def _http_get_raw(self, path):
        """GET request returning raw response text."""
        url = f"{self._base_url}{path}"
        try:
            with urllib.request.urlopen(url, timeout=5) as resp:
                return resp.read().decode()
        except urllib.error.URLError as e:
            raise CDPError(f"CDP HTTP endpoint unreachable ({self._base_url}): {e}")

    def list_tabs(self, type_filter="page"):
        """List browser tabs via HTTP API. type_filter: 'page', 'all', etc."""
        tabs = self._http_get("/json/list")
        if type_filter and type_filter != "all":
            tabs = [t for t in tabs if t.get("type") == type_filter]
        return tabs

    def get_version(self):
        """Get browser version info."""
        return self._http_get("/json/version")

    def is_headless(self):
        """Check if the browser is running in headless mode.

        Raises CDPError if the CDP endpoint is unreachable (fail-closed).
        """
        info = self.get_version()
        if not isinstance(info, dict):
            raise CDPError(
                f"Unexpected /json/version response (expected dict, got {type(info).__name__}). "
                "The CDP endpoint may not be a Chrome browser."
            )
        browser = info.get("Browser", "").lower()
        ua = info.get("User-Agent", "").lower()
        # Detects classic/old headless ("HeadlessChrome" in Browser or User-Agent).
        # Chrome's "new headless" mode (--headless=new, default since 132+)
        # deliberately mimics headed Chrome and is NOT detectable here.
        return "headless" in browser or "headlesschrome" in ua

    def require_headed(self):
        """Raise CDPError if the browser is running headless.

        Headless browsers pose silent execution risks — actions happen
        without user visibility. Use a visible browser instance instead.

        Fails closed: also raises CDPError if the endpoint is unreachable.
        """
        if self.is_headless():
            raise CDPError(
                "Headless Chrome detected — cdp-attach requires a visible browser.\n"
                "Silent execution risk: actions occur without user visibility.\n"
                "\n"
                "Launch a visible Chrome instance:\n"
                "  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome "
                "--remote-debugging-port=9222"
            )

    def new_tab(self, url=""):
        """Open a new tab. Chrome 115+ requires PUT for /json/new."""
        if url:
            # Escape characters that are illegal in an HTTP request-target
            # (space, non-ASCII). '%' stays safe so already-encoded URLs are
            # not double-encoded; Chrome unescapes the query before use.
            url = urllib.parse.quote(url, safe="%/:?#[]@!$&'()*+,;=~.-_")
        path = f"/json/new?{url}" if url else "/json/new"
        full_url = f"{self._base_url}{path}"
        try:
            req = urllib.request.Request(full_url, method="PUT")
            with urllib.request.urlopen(req, timeout=5) as resp:
                try:
                    return json.loads(resp.read())
                except json.JSONDecodeError:
                    raise CDPError(f"Invalid JSON response from CDP endpoint: {path}")
        except urllib.error.URLError as e:
            raise CDPError(f"CDP HTTP endpoint unreachable ({self._base_url}): {e}")

    def close_tab(self, target_id):
        """Close a tab by target ID."""
        resp = self._http_get_raw(f"/json/close/{target_id}")
        return "Target is closing" in resp

    def activate_tab(self, target_id):
        """Bring tab to foreground."""
        resp = self._http_get_raw(f"/json/activate/{target_id}")
        return "Target activated" in resp

    # ── WebSocket (per-tab CDP commands) ──────────────────────────

    def connect(self, target_id=None, timeout=10):
        """Connect WebSocket to a specific tab.

        If target_id is None, uses the selected target from state.
        """
        import websocket

        if target_id is None:
            target_id = self.get_selected_target()
            if not target_id:
                raise CDPError("No tab selected. Use 'select' first or provide target_id.")

        ws_url = f"ws://{self.host}:{self.port}/devtools/page/{target_id}"

        try:
            self._ws = websocket.create_connection(
                ws_url,
                timeout=timeout,
                suppress_origin=True,
            )
        except Exception as e:
            raise CDPError(
                f"WebSocket connection failed for {target_id}: {e}\n"
                "Tab may be frozen/suspended. Try selecting an active tab."
            )

        self._msg_id = 0
        self._event_buffer = []
        return self

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False

    def send(self, method, params=None, timeout=30):
        """Send CDP command and wait for response.

        Events received while waiting are buffered in self._event_buffer.
        Raises CDPError on timeout (common with frozen tabs).
        """
        if not self._ws:
            raise CDPError("Not connected. Call connect() first.")

        self._msg_id += 1
        msg_id = self._msg_id
        payload = {"id": msg_id, "method": method}
        if params:
            payload["params"] = params

        try:
            self._ws.send(json.dumps(payload))
        except Exception as e:
            _log_error("send", {
                "method": method,
                "params": params or {},
                "error": f"{type(e).__name__}: {e}",
                "kind": "ws_send_error",
            })
            raise CDPConnectionError(
                f"WebSocket send failed for {method}: {type(e).__name__}: {e}\n"
                "The command was NOT sent — the connection was already dead. "
                "Re-select the tab ('list' + 'select') or run 'revive'."
            ) from e

        deadline = time.time() + timeout
        while time.time() < deadline:
            remaining = deadline - time.time()
            if remaining <= 0:
                break
            self._ws.settimeout(min(remaining, 1.0))
            try:
                raw = self._ws.recv()
                resp = json.loads(raw)
                if resp.get("id") == msg_id:
                    if "error" in resp:
                        err = resp["error"]
                        error_msg = f"CDP error ({err.get('code')}): {err.get('message')}"
                        _log_error("send", {
                            "method": method,
                            "params": params or {},
                            "error": error_msg,
                            "code": err.get("code"),
                        })
                        raise CDPError(error_msg)
                    return resp.get("result", {})
                else:
                    # Buffer events (no 'id' field) for later inspection
                    self._event_buffer.append(resp)
            except CDPError:
                # Already logged at the raise site.
                raise
            except Exception as e:
                if "timed out" in str(e).lower():
                    continue
                _log_error("send", {
                    "method": method,
                    "params": params or {},
                    "error": f"{type(e).__name__}: {e}",
                    "kind": "ws_error",
                })
                # The command was already sent — losing the response channel
                # does not mean the browser did not execute it (#50).
                raise CDPConnectionError(
                    f"WebSocket error during {method}: {type(e).__name__}: {e}\n"
                    "Outcome unknown — the command was sent and may have "
                    "executed. Verify the side effect (re-read the resource) "
                    "before treating this as a failure or retrying a "
                    "mutating action."
                ) from e

        timeout_msg = (
            f"Timeout waiting for response to {method} ({timeout}s). "
            "Tab may be frozen or suspended. Outcome unknown — the command "
            "was sent and may have executed; verify the side effect before "
            "treating this as a failure or retrying a mutating action."
        )
        _log_error("send", {
            "method": method,
            "params": params or {},
            "error": timeout_msg,
            "kind": "timeout",
        })
        raise CDPError(timeout_msg)

    def close(self):
        """Close WebSocket connection."""
        if self._ws:
            try:
                self._ws.close()
            except Exception:
                pass
            self._ws = None

    def drain_events(self):
        """Return and clear buffered events."""
        events = self._event_buffer[:]
        self._event_buffer.clear()
        return events

    def recv_one_event(self, timeout=1.0):
        """Receive one CDP event from the WebSocket.

        Returns the parsed event dict, or None on timeout. Raises CDPError
        when the connection is closed or recv fails. Use this for polling
        async events outside of send() — replaces direct `_ws.settimeout` /
        `_ws.recv` calls in callers.
        """
        import websocket

        if not self._ws:
            raise CDPError("Not connected")
        try:
            self._ws.settimeout(timeout)
            raw = self._ws.recv()
            return json.loads(raw)
        except websocket.WebSocketTimeoutException:
            return None
        except (websocket.WebSocketConnectionClosedException, ConnectionError) as e:
            raise CDPConnectionError(f"WebSocket closed during recv: {e}")

    def query_selector_node_id(self, selector):
        """Resolve a CSS selector to a DOM nodeId.

        Enables DOM domain (idempotent), fetches the document root with
        depth=0 (root nodeId is all that is needed), and queries the
        selector. Shared by callers that need a raw nodeId — for example
        DOM.setFileInputFiles or DOM.describeNode.

        Raises CDPError when the document root or selector match is missing.
        """
        self.send("DOM.enable")
        doc = self.send("DOM.getDocument", {"depth": 0, "pierce": True})
        root_node_id = doc.get("root", {}).get("nodeId", 0)
        if not root_node_id:
            raise CDPError("DOM.getDocument returned no root nodeId")
        q = self.send("DOM.querySelector", {
            "nodeId": root_node_id,
            "selector": selector,
        })
        node_id = q.get("nodeId", 0)
        if not node_id:
            raise CDPError(f"No element matches selector: {selector!r}")
        return node_id

    def _context_id_for_frame(self, frame_id, timeout=1.5):
        """Wait for executionContextCreated event matching frame_id.

        Returns context id, or None if not found within timeout. Caller is
        responsible for calling Runtime.enable beforehand.
        """
        deadline = time.time() + timeout
        while time.time() < deadline:
            for ev in self.drain_events():
                if ev.get("method") != "Runtime.executionContextCreated":
                    continue
                ctx = ev.get("params", {}).get("context", {})
                aux = ctx.get("auxData", {})
                if aux.get("frameId") == frame_id:
                    return ctx.get("id")
            try:
                ev = self.recv_one_event(timeout=0.15)
            except CDPError:
                break
            if ev is not None:
                self._event_buffer.append(ev)
        return None

    def resolve_frame_context_id(self, frame_selector):
        """Resolve a CSS selector identifying a frame owner element
        (iframe/frame/object/embed) to the executionContextId of the
        embedded document.

        Returns None when frame_selector is falsy or equals 'main'
        (caller should use the default top-frame context).
        Raises CDPError when the selector does not match a frame owner
        or no execution context is discovered within a short grace period.
        """
        if not frame_selector or frame_selector == "main":
            return None

        self.send("Runtime.enable")

        node_id = self.query_selector_node_id(frame_selector)

        desc = self.send("DOM.describeNode", {"nodeId": node_id})
        frame_id = desc.get("node", {}).get("frameId")
        if not frame_id:
            raise CDPError(
                f"Element {frame_selector!r} is not a frame owner (no frameId)"
            )

        ctx_id = self._context_id_for_frame(frame_id)
        if ctx_id is None:
            raise CDPError(
                f"No execution context found for frame {frame_id} "
                f"(selector={frame_selector!r}). Frame may be cross-origin isolated "
                "or not yet loaded."
            )
        return ctx_id

    def resolve_frame_context_id_by_url(self, url_substring):
        """Resolve a URL substring to a frame's executionContextId.

        Walks the frame tree (Page.getFrameTree), finds the first frame whose
        URL contains the substring, and returns its execution context ID.
        Useful for dynamic iframe targets where CSS selectors are unstable
        (hashed classes, dynamic IDs) but URL patterns are stable.
        """
        if not url_substring:
            return None

        self.send("Runtime.enable")
        self.send("Page.enable")

        tree = self.send("Page.getFrameTree")
        frame_id = self._find_frame_by_url(tree.get("frameTree", {}), url_substring)
        if not frame_id:
            raise CDPError(f"No frame URL contains: {url_substring!r}")

        ctx_id = self._context_id_for_frame(frame_id)
        if ctx_id is None:
            raise CDPError(
                f"No execution context found for frame {frame_id} "
                f"(url substring={url_substring!r}). Frame may be cross-origin "
                "isolated or not yet loaded."
            )
        return ctx_id

    def _find_frame_by_url(self, frame_tree_node, url_substring):
        """Walk frame tree DFS; return first frameId whose URL contains substring."""
        frame = frame_tree_node.get("frame", {})
        url = frame.get("url", "")
        if url_substring in url:
            return frame.get("id")

        for child in frame_tree_node.get("childFrames", []):
            result = self._find_frame_by_url(child, url_substring)
            if result:
                return result
        return None

    # ── State persistence ─────────────────────────────────────────

    @staticmethod
    def _atomic_save_state(state):
        """Write state to a temp file then atomically rename."""
        os.makedirs(STATE_DIR, exist_ok=True)
        fd, tmp_path = tempfile.mkstemp(dir=STATE_DIR, suffix=".tmp")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(state, f, indent=2)
            os.rename(tmp_path, STATE_FILE)
        except BaseException:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
            raise

    def _locked_state_update(self, update_fn):
        """Read-modify-write state under an exclusive file lock."""
        os.makedirs(STATE_DIR, exist_ok=True)
        lock_path = STATE_FILE + ".lock"
        with open(lock_path, "w") as lock_f:
            fcntl.flock(lock_f, fcntl.LOCK_EX)
            try:
                state = self.load_state()
                update_fn(state)
                self._atomic_save_state(state)
            finally:
                fcntl.flock(lock_f, fcntl.LOCK_UN)

    def load_state(self):
        """Load persisted state."""
        try:
            with open(STATE_FILE) as f:
                return json.load(f)
        except (FileNotFoundError, json.JSONDecodeError):
            return {}

    def save_state(self, target_id, host=None, port=None):
        """Save selected target to state file."""
        h = host or self.host
        p = port or self.port

        def _update(state):
            state["selected_target"] = target_id
            state["host"] = h
            state["port"] = p
            state["timestamp"] = time.time()

        self._locked_state_update(_update)

    def get_selected_target(self):
        """Get the currently selected target ID from state."""
        state = self.load_state()
        return state.get("selected_target")

    def save_pid(self, process_type, pid):
        """Save a background process PID to state."""
        def _update(state):
            pids = state.setdefault("pids", {})
            pids[process_type] = {"pid": pid, "create_time": time.time()}

        self._locked_state_update(_update)

    def get_pid(self, process_type):
        """Get a saved background process PID entry."""
        state = self.load_state()
        entry = state.get("pids", {}).get(process_type)
        if entry is None:
            return None
        # Backwards compat: old format stored bare int
        if isinstance(entry, int):
            return {"pid": entry, "create_time": 0}
        return entry

    def clear_pid(self, process_type):
        """Remove a saved PID."""
        def _update(state):
            state.get("pids", {}).pop(process_type, None)

        self._locked_state_update(_update)


@contextlib.contextmanager
def cdp_lock(host=None, port=None):
    """Global single-access semaphore for CDP browser access.

    Serializes all CDP operations across concurrent sessions/subagents via an
    exclusive flock on a per-(host,port) lock file in STATE_DIR. Kernel-enforced
    and auto-released on process death (no stale-lock bookkeeping needed).

    Blocks up to CDP_ATTACH_LOCK_TIMEOUT seconds (default 10) trying to acquire,
    then fails fast with CDPError. Disabled entirely when CDP_ATTACH_NO_LOCK=1.
    The flock is the mutual-exclusion mechanism; the JSON owner record written
    into the lock file is informational (attribution / error messages) only.
    """
    if os.environ.get("CDP_ATTACH_NO_LOCK") == "1":
        yield
        return
    h = host or os.environ.get("CDP_HOST", "127.0.0.1")
    p = int(port or os.environ.get("CDP_PORT", "9222"))
    os.makedirs(STATE_DIR, exist_ok=True)
    lock_path = os.path.join(STATE_DIR, f"cdp-{h}-{p}.lock")
    timeout = float(os.environ.get("CDP_ATTACH_LOCK_TIMEOUT", "10"))
    # "a+" => create-if-absent, do NOT truncate a current holder's record
    lock_f = open(lock_path, "a+")
    deadline = time.time() + timeout
    acquired = False
    while time.time() < deadline:
        try:
            fcntl.flock(lock_f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            acquired = True
            break
        except (BlockingIOError, OSError):
            time.sleep(0.1)
    if not acquired:
        # best-effort read of the current owner for a helpful message
        holder = ""
        try:
            lock_f.seek(0)
            holder = lock_f.read().strip()
        except Exception:
            pass
        lock_f.close()
        raise CDPError(
            f"CDP busy: another session holds the lock on {h}:{p} after waiting "
            f"{timeout:.0f}s. Holder: {holder or 'unknown'}. Retry shortly, raise "
            f"CDP_ATTACH_LOCK_TIMEOUT, or set CDP_ATTACH_NO_LOCK=1 to bypass."
        )
    try:
        try:
            lock_f.seek(0)
            lock_f.truncate()
            lock_f.write(json.dumps({
                "session_id": os.environ.get("CLAUDE_CODE_SESSION_ID"),
                "pid": os.getpid(),
                "acquired_at": time.time(),
            }))
            lock_f.flush()
        except Exception:
            pass  # owner record is best-effort; never block the caller
        yield
    finally:
        try:
            fcntl.flock(lock_f, fcntl.LOCK_UN)
        except Exception:
            pass
        lock_f.close()
