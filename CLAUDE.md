# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 개요

Claude Code용 플러그인 마켓플레이스. 스킬(skills), 에이전트(agents), MCP 통합을 제공하는 다양한 플러그인들을 포함합니다.

## 아키텍처

### 계층 구조

```
.claude-plugin/marketplace.json     # 마켓플레이스: 플러그인 목록 + source 경로
{plugin}/.claude-plugin/plugin.json # 플러그인: name, version, description
{plugin}/skills/{name}/SKILL.md     # 스킬: 사용자가 /name으로 호출
{plugin}/agents/{name}.md           # 에이전트: Task tool로 자동 위임
{plugin}/.mcp.json                  # MCP: 외부 도구 통합 (선택)
external-plugin/{name}/             # 서드파티 통합용 별도 디렉토리
```

### 스킬 구조

```yaml
# skills/{name}/SKILL.md
---
name: skill-name
description: |  # 3인칭 + 트리거 문구
  This skill should be used when user asks to "trigger phrase 1", "trigger phrase 2".
  Provides [capability].
---
# 상세 프롬프트 (명령형/부정사 형태로 작성)
```

`references/` 폴더에 API 문서, 예제 배치. `scripts/` 폴더에 헬퍼 스크립트(bash/python) 배치.

### 에이전트 구조

```yaml
# agents/{name}.md
---
name: agent-name
description: 에이전트 설명  # ≤15 words (메인 컨텍스트 상주)
tools: [Bash, Read, mcp__*]  # 허용 도구 (선택, 생략 시 전체)
color: cyan                   # UI 색상 (선택)
model: haiku                  # sonnet(기본) 또는 haiku
skills: skill-name            # 스킬 자동 로드 (선택)
---
# 프롬프트 지시사항 (원칙/경계만, 워크플로우는 스킬에서 제공)
```

**Multi-skill 로딩:**
```yaml
skills:
  - linear:activity
  - github-activity:github-activity
  - google:calendar-sync
```

**Tool restriction 패턴:**
```yaml
tools: [Read, Write, mcp__plugin_linear_linear__*]  # 특정 MCP만
tools: [mcp__bigquery__*, Read]                      # Read-only + MCP
```

**Agent-Skill 분리 원칙:**
- Agent = "how to behave" (원칙, 경계, 오류 철학)
- Skill = "what to do" (워크플로우, 절차, 명령어)
- `skills:` 로드 시 agent에서 스킬 내용 중복 제거

### MCP 설정

```json
// HTTP (원격 API)
{
  "mcpServers": {
    "tavily": {
      "type": "http",
      "url": "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"
    }
  }
}

// Command (로컬 도구)
{
  "mcpServers": {
    "bigquery": {
      "command": "${HOME}/.gemini/extensions/bigquery/toolbox",
      "args": ["--stdio"],
      "env": {"BIGQUERY_PROJECT": "${GOOGLE_CLOUD_PROJECT}"}
    }
  }
}
```

## 개발 워크플로우

### 테스트

```bash
# Claude Code에서 실행
/plugin marketplace add https://github.com/jongwony/cc-plugin
/plugin install {plugin-name}
```

### 버전 업데이트

`{plugin}/.claude-plugin/plugin.json`의 `version` 수정.
marketplace.json은 source 경로만 관리 (버전 미포함).

### 파일 이동

```bash
git mv old-path.md new-path.md  # 히스토리 보존
```
