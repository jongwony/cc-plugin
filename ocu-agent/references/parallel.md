# Parallel ocu-operator runs

- **Independent windows.** Split work by window when each run's operations
  preserve the other runs' state and input targets. Check the app's own
  restrictions; serialize operations whose independence is unestablished.
  Give each operator its app, `window_id`, permitted operations and
  app-specific limits.
- **Window IDs.** ocu does not list an app's windows; read each window's
  CGWindowID as `kCGWindowNumber` from `CGWindowListCopyWindowInfo` (e.g.
  `osascript -l JavaScript` with `ObjC.import("CoreGraphics")`, which needs no
  Automation permission, unlike System Events).
- **Shared cleanup.** Coordinate ocu sessions on this desktop so no overlapping
  run relies on `agent_display`: an operator ending can restore another run's
  parked window. Defer overlap if this condition cannot be established.
- **App preparation.** Prepare non-running target apps before delegation;
  launching can bring them forward. Return the user's foreground app afterwards.
