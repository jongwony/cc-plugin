# BigQuery Plugin

BigQuery 데이터 분석을 위한 Claude Code 플러그인입니다.

## Prerequisites

- Gemini BigQuery Data Analytics 확장 설치 필요
- `GOOGLE_CLOUD_PROJECT` 환경 변수 설정

## Installation

```bash
/plugin install bigquery
```

## Agent

### data-analyst

BigQuery 데이터 분석 전문 에이전트입니다.

**사용 예시:**
- "users 테이블의 일별 가입자 수를 분석해줘"
- "매출 데이터에서 이상치를 찾아줘"
- "orders 테이블 스키마를 설명해줘"

## MCP Server

Gemini BigQuery Data Analytics 툴박스를 MCP 서버로 제공합니다.
