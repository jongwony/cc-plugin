# Rendering — From a `seek(t)` Page to Frames and an mp4

Read when Phase 5 or 6 renders. The page follows the Phase 4 contract in `SKILL.md`; write the capture for this run in the output folder, with whatever Playwright and ffmpeg calls fit.

- Serve the output folder over local http (`python3 -m http.server --directory <folder> <port>`), not `file://`, so `fetch()` and module imports load as on the web.
- Open the page with Playwright at the frame size; for each time `t`, call `seek(t)`, await its result when it is a Promise, and capture the frame.
- Keep the page's `console.warn` lines and its failed requests from the capture: they are the warnings Phase 5 shows the person.
- Preview: capture the chosen times as stills, and mix the sound sources into one file the person can listen to. A candidate that differs in motion (frame rate, blur, speed) is shown as a short clip rendered the same way.
- Render: pipe the frames to ffmpeg at the sheet's frame rate and mix every sound source in, the mp4 running `DURATION`.

Three mistakes give a wrong result with nothing failing:

- **The picture**: map the page's frames as the video stream explicitly; ffmpeg otherwise picks a supplied file's own video stream over them.
- **The wait**: await only a real Promise from `seek`; a thenable such as a GSAP timeline, awaited, waits for the timeline to finish, and a value not awaited lets the capture run before the frame is drawn.
- **The blur**: blend motion-blur subframes over a window that starts at each frame's time, so frame 0 is blurred like the rest.
