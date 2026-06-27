#!/usr/bin/env uv run --quiet --script
# /// script
# requires-python = ">=3.9"
# dependencies = ["manim==0.20.*"]
# ///
"""Render a Manim Scene headless and emit a browser-embeddable video + snippet.

Thin driver over Manim's programmatic render path (`tempconfig(...).render()` —
the same thing the `manim` CLI does). Manim is the externally-provisioned runtime:
the PEP 723 metadata above makes `uv run` auto-provision `manim==0.20.*` on first
run (cached thereafter). System libraries Cairo + Pango (and `pkg-config` to find
them) must already be present — see the SKILL preflight.

The default Cairo renderer is pure software, so this runs fully headless (no
display). FFmpeg is bundled inside the `av` wheel — not a separate system dep.
Manim output carries no audio track, which satisfies browser muted-autoplay.

Input — a `.py` file defining one or more `Scene` subclasses (or `-` for stdin):

    render.py scene.py --scene MyScene
    render.py scene.py                 # auto-picks the sole Scene subclass
    cat scene.py | render.py -         # read scene source from stdin

Output — moves the rendered file to a known path and prints both the absolute
path and a ready-to-paste embed snippet (a `<video>` tag for mp4/webm, an `<img>`
tag for gif).

Flags:
    --scene/-s NAME    which Scene subclass to render (default: the sole one)
    --format/-f FMT    mp4 (default) | webm | gif
    --quality/-q Q     low | medium (default) | high | fourk
    --output/-o PATH   destination file (default: ~/manim-output/<Scene>.<ext>)
    --transparent/-t   transparent background (implies webm; alpha needs VP9)
    --latex            assert a LaTeX toolchain is present before rendering
                       (opt-in; only Tex/MathTex mobjects need it — keep OFF
                       otherwise, a full TeX install is multi-GB)
    --keep-work        keep the intermediate media/work directory
"""
import argparse
import html
import importlib.util
import shutil
import sys
import tempfile
from pathlib import Path

try:
    from manim import Scene, tempconfig
    from manim.utils.file_ops import is_gif_format
except ImportError:
    print(
        "Error: manim not installed. Run via `uv run` (auto-provisions it), or:\n"
        "  uv pip install 'manim==0.20.*'\n"
        "System deps first: brew install cairo pango pkg-config",
        file=sys.stderr,
    )
    sys.exit(1)

QUALITY = {
    "low": "low_quality",        # 480p15
    "medium": "medium_quality",  # 720p30
    "high": "high_quality",      # 1080p60
    "fourk": "fourk_quality",    # 2160p60
}
EXT = {"mp4": ".mp4", "webm": ".webm", "gif": ".gif"}


def load_scene_classes(scene_file, work_dir):
    """Import the source file and return {name: class} for its own Scene subclasses.

    Filtering on `cls.__module__ == module.__name__` drops the base classes the
    user imported from manim (Scene, ThreeDScene, ...), keeping only those defined
    in the file itself.
    """
    if scene_file == "-":
        path = work_dir / "_stdin_scene.py"
        path.write_text(sys.stdin.read(), encoding="utf-8")
    else:
        path = Path(scene_file).expanduser().resolve()
        if not path.is_file():
            sys.exit(f"Error: scene file not found: {path}")

    spec = importlib.util.spec_from_file_location("manim_user_scene", path)
    if spec is None or spec.loader is None:
        sys.exit(f"Error: could not load scene file as a Python module: {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    try:
        spec.loader.exec_module(module)
    except Exception as exc:  # noqa: BLE001 - surface authoring errors plainly
        sys.exit(f"Error: failed to import scene file ({path}):\n  {exc}")

    return {
        name: obj
        for name, obj in vars(module).items()
        if isinstance(obj, type)
        and issubclass(obj, Scene)
        and obj.__module__ == module.__name__
    }


def assert_latex_available():
    """Preflight for Tex/MathTex scenes: a missing LaTeX toolchain fails clean here
    instead of as a deep manim traceback at render time."""
    missing = [b for b in ("latex", "dvisvgm") if shutil.which(b) is None]
    if missing:
        sys.exit(
            "Error: --latex requested but missing on PATH: "
            + ", ".join(missing)
            + "\nInstall a TeX toolchain (e.g. `brew install --cask mactex-no-gui`,\n"
            "or the lighter TinyTeX), then retry. Omit --latex for non-equation scenes."
        )


def main():
    ap = argparse.ArgumentParser(
        description="Render a Manim Scene headless to a browser-embeddable video."
    )
    ap.add_argument("scene_file", help="path to a .py file with a Scene subclass (or - for stdin)")
    ap.add_argument("--scene", "-s", help="Scene class to render (default: the sole one)")
    ap.add_argument("--format", "-f", choices=list(EXT), default="mp4")
    ap.add_argument("--quality", "-q", choices=list(QUALITY), default="medium")
    ap.add_argument("--output", "-o", help="output file path (default: ~/manim-output/<Scene>.<ext>)")
    ap.add_argument("--transparent", "-t", action="store_true", help="transparent bg (implies webm)")
    ap.add_argument("--latex", action="store_true", help="assert LaTeX toolchain before rendering")
    ap.add_argument("--keep-work", action="store_true", help="keep the intermediate media dir")
    args = ap.parse_args()

    if args.latex:
        assert_latex_available()

    fmt = args.format
    if args.transparent and fmt != "webm":
        print(f"Note: --transparent needs an alpha codec; switching format {fmt} -> webm.", file=sys.stderr)
        fmt = "webm"

    work_dir = Path(tempfile.mkdtemp(prefix="manim-work-"))
    try:
        scenes = load_scene_classes(args.scene_file, work_dir)
        if not scenes:
            sys.exit("Error: no Scene subclass found in the file. Define `class X(Scene): def construct(self): ...`.")

        if args.scene:
            if args.scene not in scenes:
                sys.exit(f"Error: scene '{args.scene}' not found. Available: {', '.join(scenes)}")
            scene_name = args.scene
        elif len(scenes) == 1:
            scene_name = next(iter(scenes))
        else:
            sys.exit(f"Error: multiple scenes found, pass --scene NAME. Available: {', '.join(scenes)}")

        out_path = (
            Path(args.output).expanduser().resolve()
            if args.output
            else Path.home() / "manim-output" / f"{scene_name}{EXT[fmt]}"
        )
        # Keep the container extension honest: the bytes are always EXT[fmt] (e.g.
        # --transparent forces webm), so a mismatched --output suffix would mislabel
        # the file and break the served <video>/<img> MIME type.
        if out_path.suffix.lower() != EXT[fmt]:
            corrected = out_path.with_suffix(EXT[fmt])
            if args.output:
                print(f"Note: output suffix '{out_path.suffix}' != {fmt}; writing '{corrected.name}'.", file=sys.stderr)
            out_path = corrected

        overrides = {
            "format": fmt,
            "media_dir": str(work_dir),
            "quality": QUALITY[args.quality],
            "output_file": scene_name,
        }
        if args.transparent:
            overrides["transparent"] = True

        with tempconfig(overrides):
            scene = scenes[scene_name]()
            try:
                scene.render()
            except Exception as exc:  # noqa: BLE001
                hint = ""
                if "latex" in str(exc).lower() or "dvisvgm" in str(exc).lower():
                    hint = "\nHint: this scene uses Tex/MathTex — install a LaTeX toolchain and re-run with --latex."
                sys.exit(f"Error: render failed:\n  {exc}{hint}")
            fw = scene.renderer.file_writer
            produced = Path(fw.gif_file_path if is_gif_format() else fw.movie_file_path)

        out_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(produced), str(out_path))
    finally:
        if not args.keep_work:
            shutil.rmtree(work_dir, ignore_errors=True)

    # Escape the path into the HTML attribute — a path may legally contain " & < >,
    # which would break the snippet's markup when pasted.
    src = html.escape(str(out_path), quote=True)
    if fmt == "gif":
        snippet = f'<img src="{src}" alt="{html.escape(scene_name)}" loading="lazy">'
    else:
        snippet = f'<video autoplay muted loop playsinline src="{src}"></video>'

    print(f"\nMANIM_OUTPUT_PATH={out_path}")
    print("\nEmbed snippet (swap src for your served URL when hosting):")
    print(snippet)


if __name__ == "__main__":
    main()
