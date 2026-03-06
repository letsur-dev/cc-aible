# contents-ax: 강의 콘텐츠 생성 플러그인

Claude Code용 강의 스토리라인 및 스크립트 생성 워크플로우 플러그인입니다.

AI 에이전트가 인터뷰, 작성, 사용자 리뷰를 단계적으로 수행하여 고품질 강의 콘텐츠를 생성합니다.

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
/plugin install contents-ax@letsur-dev-cc-aible
```

또는 `/plugin` → **Discover** 탭에서 `contents-ax`를 선택하여 설치합니다.
User 스코프를 선택해 설치를 끝낸 뒤, Claude Code를 재시작합니다.

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
Phase 1: 인터뷰         → 주제, 학습 목표, 대상 청중, 분량 등 수집
Phase 2: 작성           → 스토리라인 초안 생성
Phase 3: 파트별 리뷰    → 사용자가 파트별로 피드백 및 승인
Phase 4: 슬라이드 분할  → 스토리라인을 슬라이드 단위로 분할
```

**출력:**

```
storylines/<강의 제목>/
├── storyline.md    ← 최종 스토리라인
├── slides.md       ← 슬라이드 분할 결과
└── history.md      ← 피드백, 수정 이력
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
Phase 0: 맥락 수집       → 대상 청중, 톤/스타일, 강의 목적
Phase 1: 슬라이드 수집   → Google Slides에서 이미지 다운로드
Phase 2: 시각 설명       → 각 슬라이드의 구조/내용 분석 (--direct 시 생략)
Phase 3: 스크립트 작성   → 슬라이드별 강의 스크립트 생성
Phase 4: 파트별 리뷰     → 사용자가 슬라이드별로 피드백 및 승인
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

인증 정보는 `~/.config/contents-ax/.env`에 저장되어 **모든 프로젝트에서 자동으로 재사용**됩니다.

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

## 프로젝트 구조

```
plugins/contents-ax/
├── .claude-plugin/
│   └── plugin.json            ← 플러그인 매니페스트
├── agents/
│   ├── storyline/             ← 스토리라인 에이전트
│   │   ├── writer.md
│   │   ├── reviewer.md
│   │   ├── red-team.md
│   │   └── slide-splitter.md
│   └── script/                ← 강의 스크립트 에이전트
│       ├── writer.md
│       ├── reviewer.md
│       ├── red-team.md
│       └── describer.md
├── commands/                  ← 워크플로우 커맨드
│   ├── storyline.md
│   └── lecture-script.md
├── prompts/                   ← 공유 프롬프트
│   └── interviewer.md
└── scripts/                   ← 유틸리티 스크립트
    └── download-slides.mjs
```

## 라이선스

Private - All rights reserved
