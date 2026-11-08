---
name: safe-uninstall
description: |
  This skill should be used when the user asks to "remove program", "uninstall app",
  "delete daemon", "clean up process", "safe uninstall", "find resource hog",
  "what is this process", "remove bloatware", "kill daemon", "remove LaunchDaemon",
  "remove security program", "Activity Monitor finding", "high memory process",
  or wants to safely identify and remove macOS programs and daemons.
  Also triggers when the user mentions high memory/CPU usage by unknown processes,
  Activity Monitor concerns, unwanted LaunchDaemons/Agents, or Korean banking
  security programs (TouchEn, AhnLab, Veraport, INISAFE, CrossEX).
  Use this skill even when the user simply provides a process name and wants it gone,
  or describes a process consuming excessive resources they want to investigate.
---

# Safe Uninstall

Safely identify, investigate, and remove macOS programs through a structured
workflow: target identification, comprehensive investigation, removal approach
selection, risk-assessed execution, and verification.

## Prerequisite

Splitting the removal into units uses Merismos (`/apportion`) from the
epistemic-protocols marketplace: `/plugin install merismos@epistemic-protocols`.

## Workflow Overview

```
Target Identification → Investigation → Report → Approach Selection → Apportion → Execution → Verification
```

## Phase 1: Target Identification

Support two entry points depending on user context.

### A. Resource Scan

When the user reports high resource usage, unknown processes, or Activity Monitor
concerns, start with a resource scan to identify the target:

1. Scan top processes by memory and CPU:
   ```bash
   ps aux --sort=-%mem | head -20
   ps aux --sort=-%cpu | head -20
   ```
2. Present non-system processes consuming significant resources (filter out
   kernel_task, WindowServer, and other known macOS system processes)
3. For unknown processes, gather identification signals:
   ```bash
   codesign -dv --verbose=2 <binary_path> 2>&1  # vendor identity
   ```
4. User selects target process for investigation

### B. Direct Specification

When the user names a specific process or program, confirm the target and derive
search patterns (see `references/investigation-paths.md` for pattern derivation).

## Phase 2: Comprehensive Investigation

Delegate investigation to a subagent for efficient parallel execution.

Derive multiple search patterns from the target: binary path components, process
name, vendor name, product name. Use case-insensitive grep across ALL locations.

### Investigation Checklist

Every investigation must cover all of these (no shortcuts):

| Category | Command Pattern |
|----------|----------------|
| Running processes | `ps aux \| grep -i -E "<patterns>"` |
| LaunchDaemons | `ls /Library/LaunchDaemons/ \| grep -i -E "<patterns>"` |
| LaunchAgents (system) | `ls /Library/LaunchAgents/ \| grep -i -E "<patterns>"` |
| LaunchAgents (user) | `ls ~/Library/LaunchAgents/ \| grep -i -E "<patterns>"` |
| Application Support | `ls "/Library/Application Support/" \| grep -i -E "<patterns>"` |
| Applications | `ls /Applications/ \| grep -i -E "<patterns>"` |
| Kernel Extensions | `ls /Library/Extensions/ \| grep -i -E "<patterns>"` |
| System Extensions | `ls /Library/SystemExtensions/ \| grep -i -E "<patterns>"` |
| Privileged Helpers | `ls /Library/PrivilegedHelperTools/ \| grep -i -E "<patterns>"` |
| Browser Plugins | `ls "/Library/Internet Plug-Ins/" \| grep -i -E "<patterns>"` |
| Login Items | `osascript -e 'tell application "System Events" to get the name of every login item'` |
| Package Receipts | `pkgutil --pkgs \| grep -i -E "<patterns>"` |
| Uninstaller search | `find /Applications -iname "*uninstall*" \| grep -i -E "<patterns>"` |

For each LaunchDaemon/Agent plist found, **read it** to extract KeepAlive,
RunAtLoad, and Program properties — these determine the removal strategy.

Also check for companion frameworks in sibling Application Support directories
(see `references/investigation-paths.md` for known companion patterns).

## Phase 3: Report

Present findings as a structured report so the user can make an informed decision.

**Template:**

```
## [Program Name] — Investigation Report

**Running Processes:**
| PID | User | %MEM | %CPU | Binary Path |
|-----|------|------|------|-------------|

**LaunchDaemons/Agents (KeepAlive services respawn after kill):**
| plist Path | KeepAlive | RunAtLoad |
|------------|-----------|-----------|

**Installed Files:**
| Category | Path | Notes |
|----------|------|-------|

**Uninstaller:** [path or "Not found"]
**Package Receipts:** [list or "None"]
**Companion Frameworks:** [list or "None"]
```

## Phase 4: Removal Approach Selection

Present options based on findings:

1. **Official Uninstaller** (when found) — Run first, then verify and clean up
   leftovers. The vendor understands their own installation layout best.
2. **Manual Removal** — Direct removal of all identified components.
   Appropriate when no uninstaller exists.

## Phase 5: Apportion and Execute

When the report leaves nothing to remove, say in plain words that the removal
step is skipped because nothing is left, give the Phase 6 status from the
investigation itself, and end there.

Otherwise hand the removal to `/apportion` as one goal: remove the components
the report lists, by the approach the user selected. The Phase 6 verification
items for each component are the checks its unit's done is derived from. The
user takes the plan Merismos returns — units, each with its checks, accepted
gaps and held-open judgments — and execution follows that plan.

**Contract.** The plan the user takes is the contract for execution. In the
authority the apportion sheet shows, list every irreversible operation — file
deletion, service removal, process kill, uninstaller run, `pkgutil --forget`,
anything under `sudo` — with the target it acts on and the conditions that halt
execution. Only what the contract lists runs, and an approved operation
authorizes only the effects established before approval. Where an operation's
effects cannot be bounded beforehand — a recursive delete over contents not yet
inventoried, an uninstaller whose removals are unknown — establish its scope
before the user takes the plan, or leave it out of the plan as a held-open
judgment for the user to decide.

**Runtime halt.** Approval binds to the target itself, not to its name or
number. Immediately before each irreversible operation, re-establish that the
target is the one approved; after it, wait until its effects have settled, then
run its unit's checks. Stop when an operation fails, a check fails, a target
cannot be re-established as the one approved, a removed service returns, or
anything the contract does not name appears. On a stop, leave the remaining
units unrun, report what deviated and the state reached, and wait. Continue
only on the user's explicit authorization to proceed under the amended
contract; an answer that informs or clarifies does not authorize continuing.

**Every path.** A step handed to the user carries the same contract and halt.
When the session cannot answer a `sudo` password prompt, hand over only the
blocked operation, in its place in the order, with its re-check, as a command
the user runs with the `!` prefix at the Claude Code prompt; continue once the
user reports it ran and its check passes.

Merismos does not order units; run them in this order (KeepAlive-aware):

1. Unload services — `launchctl bootout`/`unload` for KeepAlive plist (before kill)
2. Run uninstaller — `open /path/to/Uninstaller.app` (if selected)
3. Verify post-uninstaller — check what remains
4. Kill remaining processes — `kill <PID>`
5. Remove remaining service registrations — `launchctl remove <label>`
6. Delete files — `sudo rm -rf` for remaining directories
7. Remove browser plugins — `sudo rm` symlinks and plugin bundles
8. Forget package receipts — `sudo pkgutil --forget <id>`

## Phase 6: Verification

Check the post-state the contract named, for every item it lists: a removed
item is absent where it was found.

1. Processes: `ps aux | grep -i -E "<patterns>" | grep -v grep`
2. Services: `launchctl list 2>/dev/null | grep -i -E "<patterns>"`
3. Files: each removed path no longer exists
4. Package receipts: `pkgutil --pkgs | grep -i -E "<patterns>"`

Present final status:

```
## Removal Verification

| Item | Status |
|------|--------|
| [item description] | [Removed] / [Remaining] |

**Result:** [N] items removed, [M] remaining
```

## Edge Cases

- **Process not running**: Search by name in file system (`mdfind -name "<name>"`)
  to find installed-but-inactive programs
- **Companion frameworks**: Detect related vendor directories in Application Support
  and include in removal scope (present to user for confirmation)
- **KeepAlive services**: Always unload via launchctl before killing — otherwise
  launchd immediately respawns the process
- **Modern macOS kext restrictions**: Kernel extensions may be present on disk but
  not loaded (blocked by SIP). Note in report; still remove files
- **Broken symlinks**: Partial uninstalls may leave dangling symlinks (especially
  browser plugins). Detect via `ls -la` and include in cleanup
- **Multiple user contexts**: Some programs install both root-level (LaunchDaemon)
  and user-level (LaunchAgent) services. Ensure both are addressed
