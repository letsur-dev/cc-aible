# aible-cc: 강의 콘텐츠 생성 플러그인

Claude Code용 강의 스토리라인 및 스크립트 생성 워크플로우 플러그인입니다.

AI 에이전트가 인터뷰, 작성, 리뷰, 레드팀 분석까지 자동으로 수행하여 고품질 강의 콘텐츠를 생성합니다.

## 사전 요구사항

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) 설치
- Node.js 18 이상

## 설치

### 1. 마켓플레이스 등록

Claude Code 안에서 실행:

```
/plugin marketplace add letsur-dev/cc-aible
```

### 2. 플러그인 설치

```
/plugin install aible-cc@letsur-dev-cc-aible
```

또는 `/plugin` → **Discover** 탭에서 `aible-cc`를 선택하여 설치합니다.

**설치 범위:**

| 범위        | 설명                                         |
| ----------- | -------------------------------------------- |
| **User**    | 모든 프로젝트에서 사용 (권장)                |
| **Project** | 팀원과 공유 (`.claude/settings.json`에 기록) |
| **Local**   | 현재 리포에서만 사용 (gitignore됨)           |

## 제공 워크플로우

### 1. `/storyline` — 강의 스토리라인 생성

슬라이드 없이 주제만으로 강의 구조를 설계합니다.

**실행:**

```
/storyline
```

또는 주제를 바로 전달:

```
/storyline RAG 기반 검색 특화 AI 활용법
```

**파이프라인:**

```
Phase 1: 인터뷰    → 주제, 학습 목표, 대상 청중, 분량 등 수집
Phase 2: 작성      → 스토리라인 초안 생성
Phase 3: 리뷰 루프  → 품질 점수 기반 자동 리비전 (최대 3회)
Phase 4: 레드팀     → 구조, 논리, 실용성 비판적 분석 (선택)
Phase 5: 최종 승인  → 확정 또는 추가 수정
```

**출력:**

```
storylines/<강의 제목>/
├── storyline.md    ← 최종 스토리라인
└── history.md      ← 리뷰 점수, 피드백, 수정 이력
```

---

### 2. `/lecture-script` — 강의 스크립트 생성

Google Slides 프레젠테이션을 기반으로 슬라이드별 강의 스크립트를 생성합니다.

**실행:**

```
/lecture-script https://docs.google.com/presentation/d/PRESENTATION_ID/edit
```

`--direct` 옵션을 추가하면 시각 설명 단계를 건너뛰고 이미지를 직접 분석합니다:

```
/lecture-script https://docs.google.com/presentation/d/PRESENTATION_ID/edit --direct
```

**파이프라인:**

```
Phase 0: 맥락 수집     → 대상 청중, 톤/스타일, 강의 목적
Phase 1: 슬라이드 수집  → Google Slides에서 이미지 다운로드
Phase 2: 시각 설명      → 각 슬라이드의 구조/내용 분석 (--direct 시 생략)
Phase 3: 스크립트 작성  → 슬라이드별 강의 스크립트 생성
Phase 4: 리뷰 루프      → 품질 점수 기반 자동 리비전 (최대 3회)
Phase 5: 레드팀         → 시각정합성, 논리흐름, 전달효과 분석 (선택)
Phase 6: 최종 승인      → 확정 또는 추가 수정
```

**출력:**

```
lectures/<강의 제목>/
├── assets/
│   ├── slide_1.png
│   ├── slide_1_desc.md
│   └── ...
├── scripts.md          ← 전체 스크립트 (슬라이드별 섹션)
└── metadata.json
```

## Google 인증 설정

`/lecture-script` 워크플로우는 Google Slides API에 접근해야 합니다.

### 자동 인증 (권장)

처음 실행하면 브라우저가 자동으로 열려 Google 로그인을 안내합니다:

1. 스크립트 실행 시 브라우저가 열림
2. Google 계정으로 로그인
3. 권한 승인
4. "인증 완료" 페이지 확인 후 브라우저 닫기

인증 정보는 `~/.config/aible-cc/.env`에 저장되어 **모든 프로젝트에서 자동으로 재사용**됩니다.

### 수동 인증 (대안)

환경변수를 직접 설정할 수도 있습니다:

```bash
# 방법 1: Access Token (단기, 1시간 만료)
export GOOGLE_SLIDES_ACCESS_TOKEN="ya29...."

# 방법 2: 서비스 계정
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/service-account.json"

# 방법 3: OAuth Refresh Token
export GOOGLE_OAUTH_CLIENT_ID="..."
export GOOGLE_OAUTH_CLIENT_SECRET="..."
export GOOGLE_OAUTH_REFRESH_TOKEN="..."
```

프로젝트별로 다른 인증을 사용하려면 프로젝트 루트에 `.env` 파일을 만드세요 (사용자 레벨보다 우선).

## 리뷰 점수 기준

두 워크플로우 모두 자동 품질 리뷰를 수행합니다.

**통과 조건:**

| 항목                                   | 최소 점수        |
| -------------------------------------- | ---------------- |
| 총점                                   | 80               |
| 논리적 일관성 (logicalCoherence)       | 75               |
| 학습 목표 커버리지 (objectiveCoverage) | 80 (storyline만) |

미통과 시 피드백을 반영하여 자동 리비전하며, 최대 3회까지 반복합니다.

## 프로젝트 구조

```
plugins/aible-cc/
├── .claude-plugin/
│   └── plugin.json         ← 플러그인 매니페스트
├── agents/                 ← AI 에이전트 정의
│   ├── storyline-writer.md
│   ├── storyline-reviewer.md
│   ├── storyline-red-team.md
│   ├── lecture-script-describer.md
│   ├── lecture-script-writer.md
│   ├── lecture-script-reviewer.md
│   └── lecture-script-red-team.md
├── commands/               ← 워크플로우 커맨드
│   ├── storyline.md
│   └── lecture-script.md
├── prompts/                ← 프롬프트 템플릿
└── scripts/                ← 유틸리티 스크립트
    └── download-slides.mjs
```

## 라이선스

Private - All rights reserved
