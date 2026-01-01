# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Claude Code용 플러그인 마켓플레이스. 스킬(skills), 에이전트(agents), MCP 통합을 제공하는 다양한 플러그인들을 포함합니다.

## 아키텍처

### 계층 구조

```
.claude-plugin/marketplace.json     # 마켓플레이스: 모든 플러그인 목록
{plugin}/.claude-plugin/plugin.json # 플러그인: 버전, 메타데이터
{plugin}/skills/{name}/SKILL.md     # 스킬: 사용자가 호출하는 명령
{plugin}/agents/{name}.md           # 에이전트: 자동 실행 서브에이전트
{plugin}/.mcp.json                  # MCP: 외부 도구 통합 (선택)
```

### 스킬 vs 에이전트

| 구성 요소 | 호출 방식 | 용도 |
|-----------|-----------|------|
| Skill | 사용자가 `/skill-name`으로 호출 | 대화형 명령 실행 |
| Agent | Task tool로 자동 위임 | 격리된 컨텍스트에서 자율 작업 |

### 스킬 구조

```
skills/{name}/
├── SKILL.md              # 메인 프롬프트 (YAML frontmatter + 본문)
└── references/           # 세부 가이드 (선택)
    ├── api-reference.md
    └── examples.md
```

### 에이전트 정의 형식

```yaml
---
name: agent-name
description: 에이전트 설명
tools: [Tool1, Tool2]     # 허용 도구 제한 (선택)
color: blue               # UI 색상
model: sonnet             # 또는 haiku (경량 작업용)
---

# 프롬프트 지시사항
```

## 개발 워크플로우

### 플러그인 설치 및 테스트

```bash
# Claude Code에서 실행
/plugin marketplace add https://github.com/jongwony/cc-plugin
/plugin install {plugin-name}
```

### 버전 업데이트

두 파일을 동시에 수정:
1. `{plugin}/.claude-plugin/plugin.json`의 `version`
2. `.claude-plugin/marketplace.json`의 해당 플러그인 항목 (필요시)

### 파일 이동

히스토리 보존을 위해 `git mv` 사용:
```bash
git mv old-path.md new-path.md
```

## 플러그인 카테고리

| 카테고리 | 플러그인 | 설명 |
|----------|----------|------|
| external-plugin/ | tavily, bigquery | MCP 기반 외부 서비스 통합 |
| google/ | gemini, veo, notebooklm, nanobanana-prompt, google-calendar-sync | Google 서비스 |
| session/ | search, stash | 세션 유틸리티 |
| linear/ | activity, extended | Linear 이슈 트래커 |
| 루트 | github-activity, pdf-split, codex, etc. | 독립 유틸리티 |
