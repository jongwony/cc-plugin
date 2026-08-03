---
name: agent-device-preflight
description: |
  This skill should be used when the user asks to "connect my phone to agent-device",
  "attach a device to agent-device", "why can't agent-device see my iPhone/iPad",
  "agent-device doctor passes but open fails", "developer disk image could not be
  mounted", "No Account for Team", "this provisioning profile cannot be installed on
  this device", "xcodebuild build-for-testing failed", "agent-device snapshot times
  out", "Daemon request timed out", "agent-device is targeting the simulator instead of
  my phone", "the same signing error repeats after I fixed it", or is setting up
  agent-device against a physical iOS device for the first time. Resolves the
  environment prerequisites that must hold before `agent-device open` can attach; hands
  command-level work back to the CLI. Pass the user's request verbatim — this skill
  reads a free-form request, not a subcommand.
user_invocable: true
---

# agent-device Preflight

Bring the local environment to the state `agent-device` needs, then get out of the way.

## Scope Guard

This skill covers **attachment prerequisites only** — the one-time environment setup that
must hold before `agent-device open` can reach a device.

It deliberately holds **no command knowledge**. Once preflight passes, defer to
`agent-device help <topic>`. Do not duplicate the command surface here — it moves faster
than any static copy.

Three reasons this layer exists rather than being covered by what already ships:

- `agent-device doctor` covers none of the checks below except the CLI's own presence (item 1).
- The MCP server does not expose the connection surface, so a shell must drive attachment.
- One failure in this set is reported with an actively misleading hint (see
  **Reading failures** below). Following it wastes the session.

## Reading failures

Two rules before acting on any runner failure.

**Read `runner.log`, not just the hint.** On a signing/install failure the released CLI
can surface `The current screen is overwhelming the iOS accessibility capture (usually
heavy or animating content)` and suggest changing screens. Observed: that hint appeared
for a pure code-signing install failure; the screen was never the problem, and the exact
same screen captured 49 nodes once signing was fixed. The real cause was in
`~/.agent-device/sessions/<session>/runner.log`. The released 0.20.3 still surfaces this
misleading hint.

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

Missing or older than 0.20.0 → **stop.** Do not run `npm install -g agent-device@latest` or
`npx -y agent-device@latest` autonomously, and do not put a version or upgrade command in a
plan — upstream's own skill forbids both. Ask the user to upgrade their trusted install, or to
approve an exact-version command they run themselves. Requires Node 22.12+ (24+ for web).

### 2. Device visible, and the selector you will actually pass

```bash
xcrun devicectl list devices
```

The default table shows an **Identifier** column. That is *not* what `--udid` takes. On
any device that reports a hardware UDID, the selector is that UDID, not the Identifier
shown on screen. Derive it with the query in `references/device-and-signing-queries.md`.

**Always pass `--udid`.** Device resolution prefers *virtual* devices over physical ones,
so on a machine with simulators installed a bare `--platform ios` silently targets a
simulator instead of the real device. iPads resolve as `target=mobile`, same as iPhones.

Confirm `developerModeStatus: enabled` — **`doctor` does not check this**, and will report
no blockers on a device with it disabled. Enable on the device: Settings → Privacy &
Security → Developer Mode. The device reboots and asks once more after unlock.

Connect by cable for first setup — the alternative runner transport
(`AGENT_DEVICE_IOS_RUNNER_ROUTE=usbmux`) is cable-only.

### 2b. Device is unlocked — check it, do not assume it

A locked device cannot be driven, and **`open` does not tell you.** `open` succeeding
proves nothing about controllability, and the first real symptom is a timeout several
steps later. Check the lock state directly instead:

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
the device-preparation flow. Treat this as an effective step rather than an established
mechanism.

Do **not** jump to "Xcode is too old for this iOS version" without evidence. The DDI's
`ProductBuildVersion` is Xcode's own build number, not an iOS build number — the two are
not on a comparable scale, and a version-mismatch reading built on comparing them is
unfounded.

### 4. macOS developer tools authorized (undocumented upstream)

The `sudo` line changes machine state and requires a password — **ask the user to run it
themselves; never run it unattended.** Reverse with `sudo DevToolsSecurity -disable`.

```bash
DevToolsSecurity -status        # read-only
sudo DevToolsSecurity -enable   # WRITES: persistent system setting, needs the user's password
```

UI test runners start suspended until `testmanagerd` attaches. With this disabled the
runner never wakes and `snapshot` fails with
`Developer mode is disabled for Apple development tools`.

### 5. Signing team ID — read the certificate's `OU`, not its `CN`

```bash
security find-identity -v -p codesigning
# Note the 40-hex hash of the identity you will actually sign with.
# `find-certificate -c` matches the CN as a substring and returns only the first hit, so
# select by that hash instead — two teams give one person two certs with the same CN.
security find-certificate -a -c "<identity CN>" -p \
  | awk '/BEGIN CERT/{n++} n{print > ("/tmp/ad-cert-" n ".pem")}'
for f in /tmp/ad-cert-*.pem; do
  openssl x509 -in "$f" -noout -fingerprint -sha1 -subject
done
rm -f /tmp/ad-cert-*.pem
```

Match the fingerprint to the identity hash above, then read the `OU` off *that* certificate's
subject.

The subject looks like:

```
UID=..., CN=Apple Development: Some Name (AAAAAAAAAA), OU=BBBBBBBBBB, O=..., C=US
```

`AAAAAAAAAA` in the `CN` parenthetical is the developer's individual id. **The team id is
`OU`.** Passing the parenthetical yields
`error: No Account for Team "AAAAAAAAAA"` plus `No profiles for 'com.callstack.agentdevice.runner' were found`,
which reads like a provisioning problem and is not one.

Set the bundle id too. `agent-device help physical-device` asks for both of these and only
these, and for a bundle id **you** own — the shared default belongs to callstack's team, and
your team may not be allowed to sign it:

```bash
export AGENT_DEVICE_IOS_TEAM_ID=<the OU value>
export AGENT_DEVICE_IOS_BUNDLE_ID=com.yourname.agentdevice.runner
```

Both messages above, and the install failure in item 6, carry whichever bundle id is in
effect — the callstack default while `AGENT_DEVICE_IOS_BUNDLE_ID` is unset, your own id once
it is set.

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

Check coverage before running anything, with the query in
`references/device-and-signing-queries.md`.

If nothing covers it, register from the CLI — a **concrete** destination plus both
provisioning flags. `-allowProvisioningUpdates` alone is not enough; it creates and
updates profiles but does not register devices:

**This writes to the Apple Developer account.** It consumes one of the 100 annual device slots
for that device type, and registrations are not freely removable until membership renewal.
Ask the user before running it and wait for their answer — do not run it on your own initiative.

Two things this command has to be told, because neither reaches it on its own.

Resolve the runner project from the binary you validated in item 1 rather than from
`npm root -g`, which assumes npm was the installer — then confirm the project is actually
there before building. If that check fails, this install is laid out differently and you
locate `AgentDeviceRunner.xcodeproj` inside the installed package yourself; do not build
against a guess.

Pass the bundle id as a build setting too. `AGENT_DEVICE_IOS_BUNDLE_ID` is read by
`agent-device`, not by `xcodebuild` — the packaged project carries its own default
(`AGENT_DEVICE_IOS_RUNNER_APP_BUNDLE_ID = com.callstack.agentdevice.runner`), so a raw build
would register and sign the callstack id while every actual run uses yours. The test id
derives from it inside the project, so setting the one setting covers both.

```bash
AD_ROOT=$(dirname "$(dirname "$(readlink -f "$(command -v agent-device)")")")
PROJ="$AD_ROOT/dist/apple/runner/AgentDeviceRunner/AgentDeviceRunner.xcodeproj"
[ -d "$PROJ" ] || echo "not at $PROJ — find it inside the installed package before continuing"

xcodebuild build-for-testing \
  -project "$PROJ" \
  -scheme AgentDeviceRunner \
  -destination "platform=iOS,id=<target udid>" \
  -derivedDataPath /tmp/ad-register-dd \
  -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  CODE_SIGN_STYLE=Automatic DEVELOPMENT_TEAM=<OU value> \
  AGENT_DEVICE_IOS_RUNNER_APP_BUNDLE_ID=<the AGENT_DEVICE_IOS_BUNDLE_ID value>
```

Two things to expect:

- The build may end with
  `error: Build input file cannot be found: '...<uuid>.mobileprovision'`. That is a race —
  the newly issued profile replaced the one the build had already resolved. **Registration
  still succeeded**; re-run the coverage query rather than re-reading the exit code.
- With a concrete destination xcodebuild states the real problem plainly
  (`Device "X" isn't registered in your developer account`). That diagnostic never appears
  through agent-device's generic-destination build. To get it without spending a device slot,
  run the same command with `-allowProvisioningDeviceRegistration` removed. That is cheaper,
  not free: `-allowProvisioningUpdates` still creates and updates profiles, App IDs, and
  certificates in the account, exactly as stated above. It stays under the same ask-first
  gate — only the irreversible device slot is off the table.

### 7. Runner build cache is not device-aware

The derived-data cache key covers the team id but **not the target device or the profile
identity**, so a runner signed against one device's profile is reused verbatim for another.
After fixing anything signing-related — team id, device registration, profile refresh —
clear the cache or the old artifact is silently reused:

```bash
ls ~/.agent-device/apple-runner/derived/ios-device/          # cache-<hash> dirs
mv ~/.agent-device/apple-runner/derived/ios-device/cache-<hash> /tmp/   # reversible
```

Confirm what a built runner is actually signed for with the query in
`references/device-and-signing-queries.md`.

### 8. Daemon environment freshness

The daemon starts lazily on the first command and **captures the environment it was spawned
with**. Exporting a corrected `AGENT_DEVICE_IOS_TEAM_ID` into your shell does nothing for an
already-running daemon: it keeps building with the stale value, and the identical error
repeats as if the fix had not been applied.

Confirm what the daemon actually used. `agent-device` passes both the team and the runner
bundle id to `xcodebuild` as build settings, and that command line is echoed in the runner log,
so check for both — a daemon carrying the right team and a stale bundle id passes a team-only
check and still builds the wrong runner:

```bash
grep 'build-for-testing' ~/.agent-device/sessions/<session>/runner.log | tail -1 \
  | grep -oE '(DEVELOPMENT_TEAM|AGENT_DEVICE_IOS_RUNNER_APP_BUNDLE_ID)=[^ ]+'
```

The log is appended to rather than truncated per build, so it holds every value this session
has ever built with — including the ones from before you corrected the environment. Read only
the last `build-for-testing` line: scanning the whole file returns those stale values alongside
the corrected ones, and a build that succeeded after the restart would still read as a
mismatch.

Two lines that both match your shell mean the daemon is current. **Anything else — one line,
no lines, no log yet, or a value you do not recognise — means restart, not proceed.** A setting
the daemon never received leaves nothing in the log to disagree with, so an empty result is the
one outcome that reads like a pass and is not.

To restart the daemon:

```bash
agent-device daemon stop   # there is no `daemon start`; the next command respawns it
```

Same trap for every other `AGENT_DEVICE_*` variable.

## Sandbox

The daemon binds to localhost, and in one sandboxed agent shell that failed with
`listen EPERM`. Because `doctor` starts the daemon too, the failure strands everything
downstream of it.

It is not a property of every sandbox. A later session ran `devices`, `doctor`, `open`,
`snapshot`, and `close` entirely inside a sandboxed agent shell, and the daemon started
and stayed up throughout. So treat `listen EPERM` as the signal to re-run that shell
unsandboxed, rather than moving all agent-device work out of the sandbox pre-emptively.

## Verify

A first snapshot taking 20–30s is normal; the CLI warns about it itself. The first physical
run builds and installs a signed XCTest runner
(`AgentDeviceRunnerUITests-Runner`, bundle id `<AGENT_DEVICE_IOS_BUNDLE_ID>.uitests.xctrunner`)
onto the device — tell the user before you run this, and note that removing it is a
home-screen delete.

```bash
export AGENT_DEVICE_IOS_TEAM_ID=<OU value>
export AGENT_DEVICE_IOS_BUNDLE_ID=com.yourname.agentdevice.runner
agent-device doctor --platform ios --udid <udid>
agent-device open com.apple.Preferences --platform ios --udid <udid> --session preflight
agent-device snapshot -i --session preflight
agent-device close --session preflight
```

`doctor` passing proves less than it looks — it covers none of items 2 through 8. The snapshot is
the real gate.

Once this passes, hand off: `agent-device help workflow`.

## Failure → cause

Each row names the cause this file has evidence for, not the only cause the symptom can have.
Where a row names more than one, work them in order.

| Symptom | Cause | Section |
|---|---|---|
| `Daemon request timed out` on `snapshot`, after `open` reported success | device is locked | 2b |
| `CoreDeviceError 12040`, DDI could not be mounted | device preparation not driven | 3 |
| `Developer mode is disabled for Apple development tools` | macOS `DevToolsSecurity` off | 4 |
| `No Account for Team "..."` | team id read from `CN` instead of `OU` | 5 |
| `No profiles for ...were found` | wrong team id, or no profile Xcode can auto-select for this App ID and device; with both already correct, name the profile in `AGENT_DEVICE_IOS_PROVISIONING_PROFILE` (a profile name or specifier, not a path) | 5, 6 |
| `0xe8008012 This provisioning profile cannot be installed on this device` | target device not in any profile | 6 |
| Hint blames a heavy or animating screen | misleading in 0.20.3 — read `runner.log`; usually 6 | Reading failures |
| Signing fix applied but the same error repeats | stale runner cache, or daemon holding stale env | 7, 8 |
| Commands land on a simulator instead of the real device | `--udid` omitted; virtual devices win resolution | 2 |
| `listen EPERM` | daemon started inside a sandbox | Sandbox |
| `doctor` passes but `open`/`snapshot` fails | `doctor` covers only item 1 | — |

## Scope not covered

Android (`--test-ime` on real hardware, snapshot-helper APK auto-install, `adb reverse` for
Metro), web, the remote/cloud lease providers, `proxy`, and the degraded legacy-XCTest tier
for older devices are all outside this preflight.

This preflight is verified against physical iOS devices (iPhone and iPad, CoreDevice tier)
and the iOS simulator.
