# Linear Extended Skill

Claude Code 스킬로 Linear GraphQL API를 직접 사용하여 Document와 ProjectMilestone을 생성/수정/삭제할 수 있습니다.

## 개요

Linear MCP 서버는 읽기 작업만 제공하지만, 이 스킬은 다음 기능을 추가합니다:

### Document 기능
- ✅ `documentCreate` - 문서 생성
- ✅ `documentUpdate` - 문서 수정
- ✅ `documentDelete` - 문서 삭제
- ✅ `documentUnarchive` - 문서 복원

### ProjectMilestone 기능
- ✅ `projectMilestoneCreate` - 마일스톤 생성
- ✅ `projectMilestoneUpdate` - 마일스톤 수정
- ✅ `projectMilestoneDelete` - 마일스톤 삭제
- ✅ `projectMilestones` - 마일스톤 조회 (리스트)
- ✅ `projectMilestone` - 마일스톤 조회 (단일)
- ✅ `projectMilestoneMove` - 마일스톤 이동

## 설치

이미 설치되었습니다:
```
~/.claude/skills/linear-extended/
├── SKILL.md                    # 메인 스킬 정의
├── README.md                   # 이 문서
└── references/
    ├── document-schema.md      # Document GraphQL 스키마
    ├── milestone-schema.md     # ProjectMilestone GraphQL 스키마
    └── examples.md             # 사용 예제 모음
```

## 사전 준비

### 1. Linear API 키 발급

1. Linear 설정으로 이동: https://linear.app/settings/api
2. "Personal API keys" 섹션에서 새 키 생성
3. 키를 안전한 곳에 저장 (한 번만 표시됨)

### 2. 환경 변수 설정

```bash
# ~/.zshrc 또는 ~/.bashrc에 추가
export LINEAR_API_KEY="lin_api_xxxxxxxxxxxxxxxxxxxxx"
```

적용:
```bash
source ~/.zshrc  # 또는 ~/.bashrc
```

확인:
```bash
echo $LINEAR_API_KEY  # 키가 출력되어야 함
```

## 테스트

### API 연결 테스트

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query": "{ viewer { id name email } }"}' | jq '.'
```

**예상 출력:**
```json
{
  "data": {
    "viewer": {
      "id": "...",
      "name": "Your Name",
      "email": "your.email@example.com"
    }
  }
}
```

### 프로젝트 목록 조회

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query": "{ projects(first: 5) { nodes { id name state } } }"}' | jq '.'
```

## 사용 방법

### Claude Code에서 사용

이 스킬이 설치되면 Claude Code가 자동으로 인식합니다:

```
You: "프로젝트 abc123에 'Technical Spec' 문서를 만들어줘"

Claude: [SKILL.md의 documentCreate 예제를 사용하여 문서 생성]
```

### 직접 사용 (bash)

#### 문서 생성

```bash
PROJECT_ID="your-project-id"

# Create temp file with Python for proper JSON encoding
TEMP_FILE=$(mktemp)
python3 << EOF > "$TEMP_FILE"
import json
data = {
    "query": """mutation DocumentCreate(\$input: DocumentCreateInput!) {
        documentCreate(input: \$input) {
            success
            document { id url }
        }
    }""",
    "variables": {
        "input": {
            "title": "Technical Specification",
            "content": "# Overview\\n\\nTBD",
            "projectId": "$PROJECT_ID"
        }
    }
}
print(json.dumps(data, ensure_ascii=False))
EOF

curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d @"$TEMP_FILE" | jq '.'

rm "$TEMP_FILE"
```

#### 마일스톤 생성

```bash
PROJECT_ID="your-project-id"

# Create temp file with Python for proper JSON encoding
TEMP_FILE=$(mktemp)
python3 << EOF > "$TEMP_FILE"
import json
data = {
    "query": """mutation ProjectMilestoneCreate(\$input: ProjectMilestoneCreateInput!) {
        projectMilestoneCreate(input: \$input) {
            success
            projectMilestone { id name status }
        }
    }""",
    "variables": {
        "input": {
            "projectId": "$PROJECT_ID",
            "name": "Beta Launch",
            "targetDate": "2025-06-30"
        }
    }
}
print(json.dumps(data, ensure_ascii=False))
EOF

curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d @"$TEMP_FILE" | jq '.'

rm "$TEMP_FILE"
```

#### 마일스톤 조회

```bash
curl -X POST https://api.linear.app/graphql \
  -H "Content-Type: application/json" \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query": "{ projectMilestones(first: 10) { nodes { id name status progress targetDate project { name } } } }"}' | jq '.'
```

## Linear MCP와 함께 사용

### 권장 워크플로우

1. **Linear MCP로 ID 조회**
   ```
   You: "list projects"
   Claude: [Linear MCP의 list_projects 도구 사용]
   ```

2. **이 스킬로 생성/수정**
   ```
   You: "프로젝트 abc123에 문서 만들어줘"
   Claude: [linear-extended 스킬의 documentCreate 사용]
   ```

3. **Linear MCP로 확인**
   ```
   You: "문서 목록 보여줘"
   Claude: [Linear MCP의 list_documents 도구 사용]
   ```

### 도구 분담

| 작업 | 사용할 도구 |
|------|------------|
| 프로젝트 조회 | Linear MCP (`list_projects`) |
| 이슈 조회 | Linear MCP (`list_issues`) |
| 문서 조회 | Linear MCP (`list_documents`, `get_document`) |
| 문서 생성/수정/삭제 | **linear-extended** (이 스킬) |
| 마일스톤 조회 | **linear-extended** (이 스킬) |
| 마일스톤 생성/수정/삭제 | **linear-extended** (이 스킬) |

## 검증 결과

✅ **API 연결**: 정상 작동
✅ **프로젝트 조회**: 정상 작동 (5개 프로젝트 확인)
✅ **마일스톤 조회**: 정상 작동 (10개 마일스톤 확인, 다양한 상태)
✅ **문서 조회**: 정상 작동 (5개 문서 확인)

## 문서

- **SKILL.md**: 메인 스킬 정의 (Claude Code가 읽음)
- **references/document-schema.md**: Document API 완전한 스키마
- **references/milestone-schema.md**: ProjectMilestone API 완전한 스키마
- **references/examples.md**: 실전 예제 모음

## 예제 시나리오

### 1. 프로젝트 문서화 자동화

```bash
# 1. 프로젝트 ID 얻기 (Linear MCP 사용)
# 2. 기술 문서 생성
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{
    "query": "mutation { documentCreate(input: { title: \"API Design\", content: \"# API Endpoints\\n\\n- POST /users\\n- GET /users/:id\", projectId: \"PROJECT_ID\" }) { success document { url } } }"
  }'
```

### 2. 마일스톤 기반 프로젝트 관리

```bash
# 분기별 마일스톤 생성
for MONTH in 03 06 09 12; do
  QUARTER=$(((10#$MONTH - 1) / 3 + 1))
  TEMP_FILE=$(mktemp)

  python3 << EOF > "$TEMP_FILE"
import json
data = {
    "query": """mutation ProjectMilestoneCreate(\$input: ProjectMilestoneCreateInput!) {
        projectMilestoneCreate(input: \$input) {
            success
        }
    }""",
    "variables": {
        "input": {
            "projectId": "PROJECT_ID",
            "name": f"Q{$QUARTER} Delivery",
            "targetDate": f"2025-{$MONTH}-31"
        }
    }
}
print(json.dumps(data, ensure_ascii=False))
EOF

  curl -X POST https://api.linear.app/graphql \
    -H "Content-Type: application/json" \
    -H "Authorization: $LINEAR_API_KEY" \
    -d @"$TEMP_FILE"

  rm "$TEMP_FILE"
done
```

### 3. 진행 상황 리포트

```bash
# 모든 마일스톤의 진행률 확인
curl -X POST https://api.linear.app/graphql \
  -H "Authorization: $LINEAR_API_KEY" \
  -d '{"query": "{ projectMilestones(first: 50) { nodes { name progress status targetDate } } }"}' \
  | jq -r '.data.projectMilestones.nodes[] | "\(.name): \((.progress * 100 | round))% (\(.status))"'
```

## 문제 해결

### API 키가 작동하지 않음

```bash
# 키 확인
echo $LINEAR_API_KEY

# 키 형식 확인 (lin_api_로 시작해야 함)
echo $LINEAR_API_KEY | grep "^lin_api_"
```

### GraphQL 에러

에러 메시지를 확인:
```bash
curl ... | jq '.errors'
```

흔한 에러:
- `UNAUTHENTICATED`: API 키 확인
- `NOT_FOUND`: ID가 존재하는지 확인
- `RATE_LIMITED`: 잠시 후 재시도

## 참고 자료

- [Linear GraphQL API 공식 문서](https://linear.app/developers/graphql)
- [Linear GraphQL Schema](https://github.com/linear/linear/blob/master/packages/sdk/src/schema.graphql)
- [Claude Code Skills 가이드](https://raw.githubusercontent.com/anthropics/claude-plugins-official/refs/heads/main/plugins/plugin-dev/skills/skill-development/SKILL.md)

## 라이선스

이 스킬은 학습 및 개인 사용 목적으로 제공됩니다.
