---
name: release
description: |
  This skill should be used when the user asks to "create release", "bump version",
  "tag and push", "publish release", "make a release", "new version", "deploy release",
  "push tag", or after completing a commit/PR merge and needs to create a version release.
  Automates version bump, git tag creation, push, and GitHub release notes generation.
context: fork
---

# Release Automation

Automate semantic version bumps, git tags, and GitHub releases.

## Prerequisites

- Git repository with at least one commit
- `gh` CLI authenticated (`gh auth status`)
- Push access to remote repository

## Workflow

### Phase 1: Verify Release Readiness

```bash
# Check clean working tree
git status --porcelain

# Check remote access
git remote -v
gh auth status
```

**Dirty working tree**: Warn user. Recommend commit or stash before release.

**No remote**: Cannot push tags or create GitHub release. Abort with guidance.

### Phase 2: Detect Current Version

Search for version source file in priority order:

| Priority | File | Pattern |
|----------|------|---------|
| 1 | `package.json` | `"version": "X.Y.Z"` |
| 2 | `Cargo.toml` | `version = "X.Y.Z"` |
| 3 | `pyproject.toml` | `version = "X.Y.Z"` |
| 4 | `setup.py` | `version="X.Y.Z"` |
| 5 | `init.lua` | `obj.version = "X.Y.Z"` |

For detailed patterns: [references/version-patterns.md](references/version-patterns.md)

```bash
# Also check git tags
git describe --tags --abbrev=0 2>/dev/null || echo "No tags"
git tag -l 'v*' | sort -V | tail -5
```

**Version mismatch**: If source file version differs from latest tag, warn user and ask which to use as base.

### Phase 3: Analyze Changes for Bump Type

Get commits since last tag:

```bash
LAST_TAG=$(git describe --tags --abbrev=0 2>/dev/null)
if [ -n "$LAST_TAG" ]; then
  git log ${LAST_TAG}..HEAD --oneline
else
  git log --oneline -20
fi
```

Determine bump type from commit messages:

| Pattern | Bump Type |
|---------|-----------|
| `BREAKING CHANGE:` in body | **major** |
| `!:` after type (e.g., `feat!:`) | **major** |
| `feat:` or `feat(scope):` | **minor** |
| `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `style:`, `perf:`, `ci:`, `build:` | **patch** |

**Mixed commits**: Use highest severity (major > minor > patch).

**No conventional commits**: Default to patch, but ask user to confirm.

### Phase 4: Confirm Version Bump

Present analysis to user via `AskUserQuestion`:

```
## Version Bump Analysis

**Current version**: 1.2.3
**Commits since last release**: 5

### Changes detected:
- feat: Add new feature X
- fix: Resolve bug Y
- docs: Update README

**Recommended bump**: minor (1.2.3 -> 1.3.0)

Select version bump type:
```

Options:
- `minor (Recommended)` - 1.3.0
- `patch` - 1.2.4
- `major` - 2.0.0
- `Custom version` - User specifies

### Phase 5: Update Version Source

Update the detected version file:

**package.json** (preferred method):
```bash
npm version $NEW_VERSION --no-git-tag-version
```

**Other files**: Use Edit tool with exact string replacement.

**Multiple version files**: Update all (e.g., `init.lua` + `docs.json` for Spoons).

### Phase 6: Commit Version Bump

```bash
git add -A
git commit -m "chore: bump version to $NEW_VERSION

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>"
```

### Phase 7: Create and Push Tag

```bash
# Create annotated tag
git tag -a "v$NEW_VERSION" -m "Release v$NEW_VERSION"

# Push commit and tag
git push origin HEAD
git push origin "v$NEW_VERSION"
```

### Phase 8: Create GitHub Release

Generate release notes from commit log, categorized by conventional commit type.

**Step 1**: Collect non-merge commits since last tag:

```bash
git log ${LAST_TAG}..v${NEW_VERSION} --oneline --no-merges
```

**Step 2**: Categorize commits into sections:

| Commit prefix | Section header |
|---------------|---------------|
| `feat!:`, `BREAKING CHANGE:` | **Breaking Changes** |
| `feat:` | **Features** |
| `fix:` | **Bug Fixes** |
| `perf:` | **Performance** |
| `refactor:` | **Refactor** |
| `docs:` | **Documentation** |
| `test:`, `ci:`, `build:`, `chore:` | (omit unless noteworthy) |

**Step 3**: Create release with categorized notes:

```bash
gh release create "v$NEW_VERSION" \
  --title "v$NEW_VERSION" \
  --notes "$(cat <<'EOF'
## Breaking Changes

- Description of breaking change

## Features

- Feature description (#PR)

## Bug Fixes

- Fix description

**Full Changelog**: https://github.com/owner/repo/compare/vOLD...vNEW
EOF
)"
```

**Rules**:
- Omit empty sections (e.g., no Breaking Changes → skip that header)
- Use commit message as-is for bullet text (strip type prefix)
- Include PR number if available
- `chore: bump version` commits are always excluded
- Append `**Full Changelog**` comparison link at the end

## Output Summary

After successful release:

```
## Release Complete

**Version**: v1.3.0
**Tag**: https://github.com/owner/repo/releases/tag/v1.3.0
**Commits included**: 5

### Changes:
- feat: Add new feature X
- fix: Resolve bug Y
```

## Error Handling

### Push Rejected

```
error: failed to push some refs
hint: Updates were rejected because the remote contains work
```

**Solution**: Pull and rebase, then retry:
```bash
git pull --rebase origin main
git push origin HEAD
git push origin "v$NEW_VERSION"
```

### Tag Already Exists

```
fatal: tag 'v1.3.0' already exists
```

**Solution**: Ask user - delete existing tag or increment version.

### gh CLI Not Authenticated

```
error: gh: To use GitHub CLI...
```

**Solution**: Run `gh auth login` and retry.

### No Version File Found

**Solution**: Ask user which file contains version, or suggest creating `package.json`.

## Special Cases

### Monorepo

Multiple packages with independent versions:
- Ask user which package to release
- Update only that package's version file
- Tag format: `package-name@1.2.3` or `package-name-v1.2.3`

### Prerelease

User requests alpha/beta/rc:
```bash
# Examples
1.3.0-alpha.1
1.3.0-beta.2
1.3.0-rc.1
```

Use `--prerelease` flag (with same commit-based notes from Phase 8):
```bash
gh release create "v$NEW_VERSION" --prerelease --notes "..."
```

### Draft Release

User wants to review before publishing:
```bash
gh release create "v$NEW_VERSION" --draft --notes "..."
```

### Changelog File

If `CHANGELOG.md` exists, offer to update it:
```markdown
## [1.3.0] - 2025-01-31

### Added
- Feature X

### Fixed
- Bug Y
```

## Usage Examples

| Request | Action |
|---------|--------|
| "create release" | Full workflow with auto-detected bump type |
| "bump version minor" | Force minor bump, skip analysis |
| "release v2.0.0" | Use specified version |
| "push tag only" | Skip version file update, tag and push only |
| "prerelease alpha" | Create 1.3.0-alpha.1 prerelease |
| "draft release" | Create draft GitHub release |

## Rollback

If release needs to be reverted:

```bash
# Delete remote tag
git push origin --delete "v$VERSION"

# Delete local tag
git tag -d "v$VERSION"

# Delete GitHub release
gh release delete "v$VERSION" --yes

# Revert version commit (if needed)
git revert HEAD
```

## References

- [references/version-patterns.md](references/version-patterns.md) - Version file detection patterns and update commands
