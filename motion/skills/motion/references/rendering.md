# Rendering — From a `seek(t)` Page to Frames and an mp4

Read when Phase 5 or 6 renders. The page follows the Phase 4 contract in `SKILL.md`; write the capture for this run in the output folder, with whatever Playwright and ffmpeg calls fit.

- Serve the output folder over local http (`python3 -m http.server --bind 127.0.0.1 --directory <folder> <port>`), not `file://`, so `fetch()` and module imports load as on the web; stop the server when the render ends.
- Open the page with Playwright at the frame size; for each time `t`, call `seek(t)`, await its result when it is a Promise, and capture the frame.
- Keep the page's `console.warn` lines, its failed requests, and its HTTP responses of 400 or above from the capture: they are the warnings Phase 5 shows the person. An uncaught page error is the builder's to fix before the preview.
- Preview: capture the chosen times as stills, and mix the sound sources into one file the person can listen to, the same way the render below mixes them. A clip (Phase 5 says when) is a short time range rendered the same way.
- Render: pipe the frames to ffmpeg at the sheet's frame rate and mix every sound source in — each supplied track, from its sheet start if it has one, and the WAV `window.renderAudio()` resolves to, decoded from base64 — the mp4 running `DURATION`.

These mistakes give a wrong result with nothing failing:

- **The picture**: map the page's frames as the video stream explicitly; ffmpeg otherwise picks a supplied file's own video stream over them.
- **The wait**: await only a real Promise from `seek`; a thenable such as a GSAP timeline, awaited, waits for the timeline to finish, and a value not awaited lets the capture run before the frame is drawn; so `seek` returns nothing from a timeline library — not `return tl.seek(t)`, not even from an `async` seek, whose Promise adopts the timeline.
- **The blur**: blend motion-blur subframes over a window that starts at each frame's time, so frame 0 is blurred like the rest.
- **The frame times**: capture `t = i / fps` for `i < round(DURATION · fps)`, never `t = DURATION`; a loop otherwise repeats frame 0 and the file runs one frame long.
- **The pixel format**: encode with `-pix_fmt yuv420p`; PNG frames otherwise give a yuv444p mp4 that QuickTime, iOS and many feeds do not play.
- **The length**: cut the preview mix and the mp4 at `DURATION` (`-t`), padding a shorter track (`apad`); `amix` otherwise runs as long as its longest input, so a song longer than the video stretches the mp4 over a frozen last frame.
- **The mix**: mix with `amix=…:normalize=0` in both the preview and the render; the default lowers every source.
