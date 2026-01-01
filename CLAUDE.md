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
```

### 스킬 구조

```yaml
# skills/{name}/SKILL.md
---
name: skill-name        # 호출명 (/skill-name)
description: 한 줄 설명  # 메인 컨텍스트에 노출
---
# 상세 프롬프트 (본문)
```

`references/` 폴더에 API 문서, 예제 등 세부 가이드 배치.

### 에이전트 구조

```yaml
# agents/{name}.md
---
name: agent-name
description: 에이전트 설명
tools: [Bash, Read, mcp__*]  # 허용 도구 (선택, 생략 시 전체)
color: cyan                   # UI 색상 (선택)
model: haiku                  # sonnet(기본) 또는 haiku
---
# 프롬프트 지시사항
```

### MCP 설정

```json
// {plugin}/.mcp.json
{
  "mcpServers": {
    "server-name": {
      "type": "http",
      "url": "https://api.example.com/mcp/?key=${ENV_VAR}"
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
