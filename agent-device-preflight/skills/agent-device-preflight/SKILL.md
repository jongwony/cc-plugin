---
name: agent-device-preflight
description: |
  This skill should be used when the user asks to "connect my phone to agent-device",
  "attach a device", "why can't agent-device see my iPhone/iPad", "agent-device doctor
  passes but open fails", "developer disk image could not be mounted", "No Account for
  Team", "this provisioning profile cannot be installed on this device",
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

Three reasons this layer exists rather than being covered by what already ships:

- `agent-device doctor` does not check items 3–7 below. It reported
  `Doctor: pass` / `No blockers found` on two separate devices that could not in fact be
  driven — once with Developer Mode disabled, once with the device absent from every
  provisioning profile.
- The MCP server does not expose the connection surface at all — `connect`, `disconnect`,
  `connection`, `daemon`, `device`, `cdp`, `auth`, `proxy`, `react-devtools`, and `web`
  are all `mcpExposed: false`. An MCP client cannot drive attachment; a shell must.
- One failure in this set is reported with an actively misleading hint (see
  **Reading failures** below). Following it wastes the session.

## Reading failures

Two rules before acting on any runner failure.

**Read `runner.log`, not just the hint.** On a signing/install failure the released CLI
can surface `The current screen is overwhelming the iOS accessibility capture (usually
heavy or animating content)` and suggest changing screens. Observed: that hint appeared
for a pure code-signing install failure; the screen was never the problem, and the exact
same screen captured 49 nodes once signing was fixed. The real cause was in
`~/.agent-device/sessions/<session>/runner.log`. Upstream has already corrected this on
`main` — `runner-recycle-ledger.ts` now carries "a provisioning or code-signing error
there means the runner cannot install on this device, and no retry will help", with a
comment noting the old wording "sent people to change screens when the runner had in fact
failed to install" — but the fix is not in the published 0.20.3.

**A matching `version` field does not mean matching code.** `package.json` keeps the last
released version until the next bump, so a `main` checkout and an installed npm build can
both read `0.20.3` and differ. Verify behaviour against the installed
`dist/`, not the repository, when the two could disagree.

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
    print(p.get('name'), h.get('udid'), '|', h.get('marketingName'),
          '| transport:', c.get('transportType'), '| tunnel:', c.get('tunnelState'),
          '| devMode:', p.get('developerModeStatus'))
"
```

**Always pass `--udid`.** Device resolution prefers *virtual* devices over physical ones
(`packages/kernel/src/device.ts:240-298`), so on a machine with simulators installed a
bare `--platform ios` silently targets a simulator instead of the real device. iPads
resolve as `target=mobile`, same as iPhones.

Confirm `developerModeStatus: enabled` — **`doctor` does not check this**, and will report
no blockers on a device with it disabled. Enable on the device: Settings → Privacy &
Security → Developer Mode. The device reboots and asks once more after unlock.

Connect by cable for first setup — the alternative runner transport
(`AGENT_DEVICE_IOS_RUNNER_ROUTE=usbmux`) is cable-only.

### 2b. Device is unlocked — check it, do not assume it

A locked device cannot be driven, and **`open` does not tell you.** Measured on one device,
same session, same command, only the lock state changed:

| device state | `passcodeRequired` | `open` | `snapshot` |
|---|---|---|---|
| locked (screen off, face away) | `true` | reports `Opened: ...` | `Daemon request timed out` |
| unlocked | `false` | reports `Opened: ...` | 49 nodes |

So `open` succeeding proves nothing about controllability, and the first real symptom is a
timeout several steps later. Check the lock state directly instead:

```bash
xcrun devicectl device info lockState --device <udid>
# passcodeRequired: true  -> currently LOCKED, control will time out
# passcodeRequired: false -> currently unlocked
```

`passcodeRequired` is a live lock readout, not the static "is a passcode configured"
setting. Do not confuse it with `unlockedSinceBoot`, which stays `true` after the first
unlock and says nothing about the present moment.

Recovery needs no daemon restart: unlocking the device and re-running the same command in
the same session succeeds.

Because a Face ID device unlocks the instant its owner looks at it, "the screen was off"
and "the device was locked" are easy to conflate while sitting next to it. Remove the
variable for the whole run rather than watching it — on the device, Settings → Display &
Brightness → Auto-Lock → Never, restored afterwards.

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
established mechanism. A second device connected by cable from the start never hit this.)

Do **not** jump to "Xcode is too old for this iOS version" without evidence. The DDI's
`ProductBuildVersion` is Xcode's own build number, not an iOS build number — the two are
not on a comparable scale, and a version-mismatch reading built on comparing them is
unfounded. Xcode 26.2 drove iOS 26.5.2 and iPadOS 26.5 devices successfully.

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

Do not infer "no Apple account is signed in" from
`defaults read com.apple.dt.Xcode IDEProvisioningTeams` returning *does not exist* —
Xcode 26 does not populate that legacy key even with an account present. Check
Xcode → Settings → Accounts instead.

### 6. Target device is covered by a provisioning profile

**agent-device will not register a device for you.** It builds the runner with
`-destination generic/platform=iOS` — no target device — so automatic signing has nothing
to register, silently picks whatever profile exists, and the mismatch does not surface
until install:

```
Failed to install embedded profile for com.callstack.agentdevice.runner.uitests.xctrunner
: 0xe8008012 (This provisioning profile cannot be installed on this device.)
```

Check before running anything:

```bash
UDID=<target udid>
for f in ~/Library/Developer/Xcode/UserData/Provisioning\ Profiles/*.mobileprovision; do
  security cms -D -i "$f" > /tmp/p.plist 2>/dev/null && python3 -c "
import plistlib
d = plistlib.load(open('/tmp/p.plist','rb'))
devs = d.get('ProvisionedDevices') or []
print(d.get('Name'), '| devices:', len(devs), '| covers target:', '$UDID' in devs)
"
done
```

If nothing covers it, register from the CLI — a **concrete** destination plus both
provisioning flags. `-allowProvisioningUpdates` alone is not enough; it creates and
updates profiles but does not register devices:

```bash
xcodebuild build-for-testing \
  -project "$(npm root -g)/agent-device/dist/apple/runner/AgentDeviceRunner/AgentDeviceRunner.xcodeproj" \
  -scheme AgentDeviceRunner \
  -destination "platform=iOS,id=$UDID" \
  -derivedDataPath /tmp/ad-register-dd \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=<OU value>
```

**This writes to the Apple Developer account** — it consumes one of the 100 annual device
slots for that device type, and registrations are not freely removable until membership
renewal. Tell the user before running it.

Two things to expect:

- The build may end with
  `error: Build input file cannot be found: '...<uuid>.mobileprovision'`. That is a race —
  the newly issued profile replaced the one the build had already resolved. **Registration
  still succeeded**; re-check the profile as above rather than re-reading the exit code.
- With a concrete destination xcodebuild states the real problem plainly
  (`Device "X" isn't registered in your developer account`). That diagnostic never appears
  through agent-device's generic-destination build. Use this command as a diagnostic even
  when you do not intend to register.

### 7. Runner build cache is not device-aware

The derived-data cache key covers the team id but **not the target device or the profile
identity**, so a runner signed against one device's profile is reused verbatim for another.
After fixing anything signing-related — team id, device registration, profile refresh —
clear the cache or the old artifact is silently reused:

```bash
ls ~/.agent-device/apple-runner/derived/ios-device/          # cache-<hash> dirs
mv ~/.agent-device/apple-runner/derived/ios-device/cache-<hash> /tmp/   # reversible
```

Confirm what a built runner is actually signed for:

```bash
APP=$(find ~/.agent-device/apple-runner/derived/ios-device \
        -name "AgentDeviceRunnerUITests-Runner.app" -maxdepth 5 | head -1)
security cms -D -i "$APP/embedded.mobileprovision" > /tmp/emb.plist
python3 -c "
import plistlib
d = plistlib.load(open('/tmp/emb.plist','rb'))
print('UUID:', d.get('UUID'), '| devices:', d.get('ProvisionedDevices'))
"
```

### 8. Daemon environment freshness

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

`doctor` passing proves less than it looks — it does not cover items 3–7. The snapshot is
the real gate.

A first snapshot taking 20–30s is normal; the CLI warns about it itself. The first physical
run builds and installs a signed XCTest runner
(`AgentDeviceRunnerUITests-Runner`, bundle id `com.callstack.agentdevice.runner.uitests.xctrunner`)
onto the device — tell the user before it happens, and note that removing it is a
home-screen delete.

Once this passes, hand off: `agent-device help workflow`.

## Failure → cause

| Symptom | Cause | Section |
|---|---|---|
| `Daemon request timed out` on `snapshot`, after `open` reported success | device is locked | 2b |
| `CoreDeviceError 12040`, DDI could not be mounted | device preparation not driven | 3 |
| `Developer mode is disabled for Apple development tools` | macOS `DevToolsSecurity` off | 4 |
| `No Account for Team "..."` / `No profiles for ...were found` | team id read from `CN` instead of `OU` | 5 |
| `0xe8008012 This provisioning profile cannot be installed on this device` | target device not in any profile | 6 |
| Hint blames a heavy or animating screen | misleading in 0.20.3 — read `runner.log`; usually 6 | Reading failures |
| Signing fix applied but the same error repeats | stale runner cache, or daemon holding stale env | 7, 8 |
| Commands land on a simulator instead of the real device | `--udid` omitted; virtual devices win resolution | 2 |
| `listen EPERM` | daemon started inside a sandbox | Sandbox |
| `doctor` passes but `open`/`snapshot` fails | `doctor` does not cover 3–7 | — |

## Scope not covered

Android (`--test-ime` on real hardware, snapshot-helper APK auto-install, `adb reverse` for
Metro), web, the remote/cloud lease providers, `proxy`, and the degraded legacy-XCTest tier
for older devices are all outside this preflight.

Verified end to end (open → snapshot → press → screenshot → close) against a physical
iPhone and a physical iPad, both CoreDevice tier, plus the iOS simulator. iPad split-view
captures correctly, sidebar and detail pane both present in the accessibility tree.
