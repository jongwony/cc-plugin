---
allowed-tools: Bash(gh:*), Bash(git:*), Bash(date:*)
description: GitHub Activity Report – Calendar Format
---

# GitHub Activity Retrieval

Retrieve and organize my GitHub activity within the given period, and record the results in a structured hourly calendar format.

Use Bash(gh search:*) commands to collect data on commits, pull requests (created and merged), comments, and other activity.
Summarize these results in a way that can be mapped onto a calendar, inferring time allocation across code contributions and comments.

## Goals
- Identify all pull requests, issues, and commits during the given period.
- Measure contributions per repository.
- Convert the activity into a hourly calendar-friendly format.

## Execution Steps

### 1. Setup Periods

- Check the current date:
current_date = !`date '+%Y-%m-%d'`

- Check given date or yesterday
if [ -n "$ARGUMENTS" ]; then
  target_date="$ARGUMENTS"
else
  target_date=!`date -v-1d '+%Y-%m-%d'`
fi

### 2. Environment Setup and Authentication

- Verify GitHub CLI authentication status:
!`gh auth status`

- Retrieve current user information:
!`gh api user --jq '.login'`

### 3. Pull Request Activity

#### Pull Requests involving me (updated this week)
gh search prs --involves=@me --updated="<query: target_date to current_date>" --json number,title,repository,state,url,createdAt,closedAt,author

#### Merged Pull Requests in the delightroom organization authored by me
gh search prs --owner=delightroom --author=@me --merged --updated="<query: target_date to current_date>" --json number,title,repository,state,url,createdAt,closedAt,author

### 4. Issue Activity

#### Issues involving me
gh search issues --involves=@me --updated="<query: target_date to current_date>" --json number,title,repository,state,url,createdAt,author

### 5. Commit Activity

#### Commits authored by me (since target date)
gh search commits --author=@me --committer-date="<query: target_date to current_date>" --json commit,repository
