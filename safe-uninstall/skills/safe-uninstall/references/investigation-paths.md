# macOS Program Investigation Paths

## System Directories

| Category | Path | What to Find |
|----------|------|-------------|
| LaunchDaemons | `/Library/LaunchDaemons/` | System-level persistent services (root) |
| LaunchAgents (System) | `/Library/LaunchAgents/` | User-level persistent services (all users) |
| LaunchAgents (User) | `~/Library/LaunchAgents/` | User-level persistent services (current user) |
| Application Support | `/Library/Application Support/` | Program data, configs, binaries |
| Applications | `/Applications/` | App bundles, uninstallers |
| Kernel Extensions | `/Library/Extensions/` | Kernel drivers (legacy, often blocked by SIP) |
| System Extensions | `/Library/SystemExtensions/` | Modern system extensions |
| Privileged Helpers | `/Library/PrivilegedHelperTools/` | Privileged helper binaries |
| Browser Plugins | `/Library/Internet Plug-Ins/` | Browser plugins (NPAPI, legacy) |
| Login Items | System Preferences | Auto-start programs |
| Package Receipts | `pkgutil --pkgs` | Installer package records |

## Search Pattern Derivation

When investigating a process, derive multiple search patterns from:

1. **Binary path**: `/Library/Application Support/raonsecure/TouchEn nxKey/TEK_Daemon` yields `raon`, `raonsecure`, `touchen`, `nxkey`
2. **Process name**: `TEK_Daemon` yields `TEK`, `tek`
3. **Vendor name**: Code signature or path components (e.g., `raonsecure`, `ahnlab`)
4. **Product name**: Known product names (e.g., `TouchEn`, `Safe Transaction`)

Combine patterns with case-insensitive extended grep:
```bash
grep -i -E "pattern1|pattern2|pattern3"
```

## LaunchDaemon/Agent plist Properties

Read each found plist to determine removal strategy:

| Property | Impact |
|----------|--------|
| `KeepAlive: true` | launchd respawns after kill — must `launchctl bootout`/`unload` first |
| `RunAtLoad: true` | Starts at boot/login |
| `Program` / `ProgramArguments` | Actual binary path — verify it matches target |

## Companion Framework Detection

Programs may install companion frameworks requiring separate removal:

| Primary | Companion | Shared Location |
|---------|-----------|----------------|
| TouchEn nxKey | CrossEX (iniLINE) | `/Library/Application Support/iniLINE/` |
| Various banking | Veraport | `/Library/Application Support/Wizvera/` |

Detection: after identifying the primary program's Application Support directory, check sibling directories for related vendor names.

## Non-Interactive sudo Limitation

Claude Code subagents run in non-interactive terminals where `sudo` password prompts fail.

**Mitigation strategy:**
1. Execute all non-sudo operations first (`kill`, `launchctl remove`)
2. Collect remaining sudo commands into a single block
3. Present to user with `! <command>` prefix instructions for Claude Code prompt execution
4. Verify after user executes

## Process Identification Aids

When a process is unknown, gather identification signals:

```bash
# Binary path from PID
ps -p <PID> -o comm=

# Code signature (vendor identity)
codesign -dv --verbose=2 <binary_path> 2>&1

# File system search by name
mdfind -name "<keyword>"

# Package that installed the binary
pkgutil --file-info <binary_path>
```
