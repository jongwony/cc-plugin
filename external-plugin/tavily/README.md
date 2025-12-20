# Tavily Plugin

Tavily MCP 서버와 deep-researcher 에이전트를 제공하는 플러그인입니다.

## 기능

- **Tavily MCP Server**: 웹 검색 및 콘텐츠 추출 API
- **deep-researcher Agent**: 전문적인 웹 리서치 수행

## 설치

```bash
/plugin install tavily
```

## 환경 변수

```bash
export TAVILY_API_KEY="your-api-key"
```

[Tavily](https://tavily.com)에서 API 키를 발급받으세요.

## 사용법

### MCP Tools

- `mcp__plugin_tavily_tavily__tavily_search`: 웹 검색
- `mcp__plugin_tavily_tavily__tavily_extract`: URL 콘텐츠 추출

### Agent

deep-researcher 에이전트는 다음 상황에서 자동 트리거됩니다:

- 전문적인 조사/연구 요청
- 깊이 있는 탐색이 필요한 질문
- 다중 소스 검증이 필요한 정보 수집

## 라이선스

MIT
