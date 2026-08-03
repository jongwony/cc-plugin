---
name: agent-device-preflight
description: |
  This skill should be used when the user asks to "connect my phone to agent-device",
  "attach a device", "why can't agent-device see my iPhone", "agent-device doctor passes
  but open fails", "developer disk image could not be mounted", "No Account for Team",
  "xcodebuild build-for-testing failed", or is setting up agent-device against a physical
  iOS device for the first time. Resolves the environment prerequisites that must hold
  before `agent-device open` can attach; hands command-level work back to the CLI.
  Pass the user's request verbatim — this skill reads a free-form request, not a subcommand.
user_invocable: true
context: fork
model: sonnet
---

# agent-device Preflight

Bring the local environment to the state `agent-device` needs, then get out of the way.

## Scope Guard

This skill covers **attachment prerequisites only** — the one-time environment setup that
must hold before `agent-device open` can reach a device.

It deliberately holds **no command knowledge**. Upstream ships its own router skill
(`skills/agent-device/SKILL.md` in `callstack/agent-device`) whose stated position is
"ask the CLI, don't hardcode": it gates on `agent-device >= 0.20.0` and delegates to
`agent-device help <topic>`. Once preflight passes, defer there. Do not duplicate the
command surface here — it moves faster than any static copy.

Two reasons this layer exists rather than being covered by what already ships:

- `agent-device doctor` does not check any of items 3–6 below. It passed clean on a
  machine where `open` then failed three times in a row.
- The MCP server does not expose the connection surface at all — `connect`, `disconnect`,
  `connection`, `daemon`, `device`, `cdp`, `auth`, `proxy`, `react-devtools`, and `web`
  are all `mcpExposed: false`. An MCP client cannot drive attachment; a shell must.

## Preflight

Run in order. Each check is read-only except where marked.

### 1. CLI present and recent enough

```bash
agent-device --version   # must be >= 0.20.0
```

Not installed → `npm install -g agent-device@latest`. Requires Node 22.12+ (24+ for web).

### 2. Device visible, and the selector you will actually pass

```bash
xcrun devicectl list devices
```

The default table shows an **Identifier** column. That is *not* what `--udid` takes.
`agent-device` builds a device's id as `hardwareProperties.udid ?? identifier`
(`packages/kernel/src/device.ts:238`), so on any device that reports a hardware UDID the
selector is the UDID, not the Identifier shown on screen. Derive it:

```bash
xcrun devicectl list devices --json-output /tmp/dev.json >/dev/null
python3 -c "
import json
for d in json.load(open('/tmp/dev.json'))['result']['devices']:
    p, h = d['deviceProperties'], d['hardwareProperties']
    c = d['connectionProperties']
    print(p.get('name'), h.get('udid'), '| transport:', c.get('transportType'),
          '| tunnel:', c.get('tunnelState'), '| devMode:', p.get('developerModeStatus'))
"
```

**Always pass `--udid`.** Device resolution prefers *virtual* devices over physical ones
(`packages/kernel/src/device.ts:240-298`), so on a machine with simulators installed a
bare `--platform ios` silently targets a simulator instead of the phone.

Also confirm from that output: `developerModeStatus: enabled` (enable on the device under
Settings → Privacy & Security → Developer Mode) and a live `transportType`. Connect by
cable for first setup — the alternative runner transport
(`AGENT_DEVICE_IOS_RUNNER_ROUTE=usbmux`) is cable-only, and a locked phone wedges either
transport. Keep the screen unlocked for the whole run.

### 3. Developer disk image mounts

```bash
xcrun devicectl device info details --device <udid>
```

Success prints device details. Failure prints
`The developer disk image could not be mounted on this device. (com.apple.dt.CoreDeviceError error 12040)`
and nothing downstream will work — not `open`, not the runner install.

If it fails while pairing, Developer Mode, cable, and network to Apple are all healthy:
**open Xcode → Window → Devices and Simulators and select the device.** That window drives
the device-preparation flow. (Observed: three consecutive CLI-only attempts failed, and the
next attempt after selecting the device in Xcode succeeded. Asynchronous completion in the
interval was not controlled for, so treat this as an effective step rather than an
established mechanism.)

Do **not** jump to "Xcode is too old for this iOS version" without evidence. The DDI's
`ProductBuildVersion` is Xcode's own build number, not an iOS build number — the two are
not on a comparable scale, and a version-mismatch reading built on comparing them is
unfounded. Xcode 26.2 drove an iOS 26.5.2 device successfully.

### 4. macOS developer tools authorized (undocumented upstream)

```bash
DevToolsSecurity -status        # read-only
sudo DevToolsSecurity -enable   # WRITES: persistent system setting, needs the user's password
```

UI test runners start suspended until `testmanagerd` attaches. With this disabled the
runner never wakes and `snapshot` fails with
`Developer mode is disabled for Apple development tools`.

This requirement appears **nowhere** in the upstream README or `website/docs/`, though the
code checks it proactively (`src/platforms/apple/core/runner/runner-session.ts:620`).

The `sudo` line changes machine state and requires a password — **ask the user to run it
themselves; never run it unattended.** Reverse with `sudo DevToolsSecurity -disable`.

### 5. Signing team ID — read the certificate's `OU`, not its `CN`

```bash
security find-identity -v -p codesigning
security find-certificate -c "<identity CN>" -p | openssl x509 -noout -subject
```

The subject looks like:

```
UID=..., CN=Apple Development: Some Name (AAAAAAAAAA), OU=BBBBBBBBBB, O=..., C=US
```

`AAAAAAAAAA` in the `CN` parenthetical is the developer's individual id. **The team id is
`OU`.** Passing the parenthetical yields
`error: No Account for Team "AAAAAAAAAA"` plus `No profiles for 'com.callstack.agentdevice.runner' were found`,
which reads like a provisioning problem and is not one.

```bash
export AGENT_DEVICE_IOS_TEAM_ID=<the OU value>
```

Cross-check against an installed profile, which also tells you whether the target device is
already registered:

```bash
security cms -D -i ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision \
  > /tmp/prof.plist 2>/dev/null
python3 -c "
import plistlib
d = plistlib.load(open('/tmp/prof.plist','rb'))
print('TeamName:', d.get('TeamName'), '| TeamID:', d.get('TeamIdentifier'))
print('AppIDName:', d.get('AppIDName'), '| expires:', d.get('ExpirationDate'))
print('devices:', d.get('ProvisionedDevices'))
"
```

A wildcard App ID with a ~1-year expiry indicates a paid account. A free Personal Team gets
7-day profiles and no wildcard — there, set `AGENT_DEVICE_IOS_BUNDLE_ID` to a unique
reverse-DNS value or the build fails with "bundle identifier is not available".

### 6. Daemon environment freshness

The daemon starts lazily on the first command and **captures the environment it was spawned
with**. Exporting a corrected `AGENT_DEVICE_IOS_TEAM_ID` into your shell does nothing for an
already-running daemon: it keeps building with the stale value, and the identical error
repeats as if the fix had not been applied.

Confirm what the daemon actually used — the build command line is echoed in the runner log:

```bash
grep -o 'DEVELOPMENT_TEAM=[A-Z0-9]*' ~/.agent-device/sessions/<session>/runner.log | tail -1
```

If it disagrees with your shell, restart the daemon:

```bash
agent-device daemon stop   # there is no `daemon start`; the next command respawns it
```

Same trap for every other `AGENT_DEVICE_*` variable.

## Sandbox

The daemon binds to localhost and fails with `listen EPERM` inside a sandbox. Any
agent shell that sandboxes command execution must run agent-device work unsandboxed —
including `doctor`, since it starts the daemon too.

## Verify

```bash
export AGENT_DEVICE_IOS_TEAM_ID=<OU value>
agent-device doctor --platform ios --udid <udid>
agent-device open com.apple.Preferences --platform ios --udid <udid> --session preflight
agent-device snapshot -i --session preflight
agent-device close --session preflight
```

A first snapshot taking 20–30s is normal; the CLI warns about it itself. The first physical
run builds and installs a signed XCTest runner
(`AgentDeviceRunnerUITests-Runner`, bundle id `com.callstack.agentdevice.runner.uitests.xctrunner`)
onto the device — tell the user before it happens, and note that removing it is a home-screen
delete.

Once this passes, hand off: `agent-device help workflow`.

## Failure → cause

| Symptom | Cause | Section |
|---|---|---|
| `CoreDeviceError 12040`, DDI could not be mounted | device preparation not driven | 3 |
| `Developer mode is disabled for Apple development tools` | macOS `DevToolsSecurity` off | 4 |
| `No Account for Team "..."` / `No profiles for ...were found` | team id read from `CN` instead of `OU` | 5 |
| Same signing error after correcting the team id | daemon holding stale env | 6 |
| Commands land on a simulator instead of the phone | `--udid` omitted; virtual devices win resolution | 2 |
| `listen EPERM` | daemon started inside a sandbox | Sandbox |
| `doctor` passes but `open` fails | `doctor` does not cover 3–6 | — |

## Scope not covered

Android (`--test-ime` on real hardware, snapshot-helper APK auto-install, `adb reverse` for
Metro), web, the remote/cloud lease providers, `proxy`, and the degraded legacy-XCTest tier
for older iPhones are all outside this preflight. Verified against physical iOS
(CoreDevice tier) and the iOS simulator only.
