"""Minimal JSON GET over urllib. Headers are never echoed into errors."""

import json
import urllib.error
import urllib.parse
import urllib.request

from .model import CollectError


def encode(params):
    """Encode params; a list value repeats its key (`k=a&k=b`)."""
    pairs = []
    for k, v in params.items():
        if v is None:
            continue
        if isinstance(v, (list, tuple)):
            pairs.extend((k, str(x)) for x in v)
        else:
            pairs.append((k, str(v)))
    return urllib.parse.urlencode(pairs)


def get_json(url, params, headers, timeout=60):
    full = f"{url}?{encode(params)}" if params else url
    req = urllib.request.Request(full, headers=headers, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        body = e.read(2000).decode("utf-8", "replace")
        raise CollectError(f"HTTP {e.code} from {url}: {body}") from None
    except urllib.error.URLError as e:
        raise CollectError(f"cannot reach {url}: {e.reason}") from None
    except (TimeoutError, OSError) as e:
        raise CollectError(f"connection to {url} failed: {e}") from None
    except ValueError as e:
        raise CollectError(f"{url} returned a body that is not JSON: {e}") from None
