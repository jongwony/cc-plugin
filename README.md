# Claude Marketplace

## 설치 방법

- Claude Code에서 다음 명령어를 실행합니다:

```
/plugin marketplace add https://github.com/jongwony/claude-marketplace
/plugin install context-collector
```

## 포함된 플러그인

### context-collector

효율적인 컨텍스트 수집을 위한 커스텀 에이전트 모음

**버전**: 0.1.0

**포함된 에이전트**:

- **codex-executor**: 격리된 `codex exec` 세션을 실행하여 토큰 사용을 최적화합니다.

#### codex-executor 에이전트

컨텍스트가 많이 필요하거나 계산 집약적인 작업을 격리된 `codex exec` 세션에서 실행합니다. 메인 세션의 토큰을 보존합니다.

**주요 기능**:

- 격리된 세션에서 작업 실행
- 복잡하고 토큰 집약적인 분석 처리
- 추론 수준 조절 (low/medium/high)

**사용 시점**: 사용자가 명시적으로 `@agent-context-collector:codex-executor` 요청할 때만 사용합니다. (`@codex` 로 검색)
