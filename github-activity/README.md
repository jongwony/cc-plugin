# GitHub Activity Plugin

GitHub 활동을 추적하고 캘린더 형식으로 리포트를 생성하는 Claude Code 플러그인입니다.

## 기능

- GitHub 활동 데이터 수집 (커밋, PR, 이슈, 코멘트)
- 시간별 캘린더 형식으로 활동 정리
- 레포지토리별 기여도 측정

## 명령어

### /activity [날짜]

지정된 기간의 GitHub 활동 리포트를 생성합니다.

- 날짜를 지정하지 않으면 어제의 활동을 조회합니다
- 날짜 형식: `YYYY-MM-DD`

**예시:**
```
/activity 2025-11-01
```

## 요구사항

- GitHub CLI (`gh`) 설치 및 인증 필요
- `gh auth login` 명령으로 먼저 인증해야 합니다

## 설치

1. 이 플러그인을 로컬 플러그인 디렉토리에 클론하거나 복사합니다
2. Claude Code 설정에서 플러그인을 활성화합니다

```json
{
  "enabledPlugins": {
    "github-activity@cc-plugin": true
  }
}
```

## 작성자

jongwony
