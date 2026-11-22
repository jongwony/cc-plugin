# /// script
# requires-python = ">=3.11"
# dependencies = ["openpyxl>=3.1"]
# ///
"""Entry point: uv run --script rail_route.py <search|plan|rank> ..."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from railroute.cli import main  # noqa: E402

raise SystemExit(main())
