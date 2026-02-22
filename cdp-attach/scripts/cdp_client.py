"""
CDP Client — Shared module for direct Chrome DevTools Protocol communication.

Bypasses Puppeteer to avoid frozen-tab timeouts. Uses:
- HTTP API (urllib.request) for tab discovery (immune to frozen tabs)
- Per-tab WebSocket (websocket-client) for CDP commands

Import via sys.path manipulation in v1/v2/v3 scripts:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    from cdp_client import CDPClient
"""

import fcntl
import json
import os
import tempfile
import time
import urllib.request
import urllib.error

# State file location
STATE_DIR = os.path.expanduser("~/.cache/cdp-attach")
STATE_FILE = os.path.join(STATE_DIR, "state.json")


class CDPError(Exception):
    """CDP protocol or connection error."""
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

    def new_tab(self, url=""):
        """Open a new tab."""
        path = f"/json/new?{url}" if url else "/json/new"
        return self._http_get(path)

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

        self._ws.send(json.dumps(payload))

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
                        raise CDPError(f"CDP error ({err.get('code')}): {err.get('message')}")
                    return resp.get("result", {})
                else:
                    # Buffer events (no 'id' field) for later inspection
                    self._event_buffer.append(resp)
            except Exception as e:
                if "timed out" in str(e).lower():
                    continue
                raise

        raise CDPError(
            f"Timeout waiting for response to {method} ({timeout}s). "
            "Tab may be frozen or suspended."
        )

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
