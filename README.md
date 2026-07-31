# Arduino Project Studio AI

고등학교 아두이노 프로젝트 수업에서 학생이 문제 발견부터 하드웨어 구성과 제작 계획까지 6단계 기획안을 작성하고, 교사가 제출 결과를 검토하는 웹 애플리케이션입니다.

## 해결하려는 교육 문제

학생이 아이디어를 바로 제작으로 옮기면서 문제 정의, 성공 기준, 부품 호환성, 안전 및 역할 분담을 빠뜨리는 문제를 줄입니다. AI 검토는 학생 대신 답을 작성하지 않고 추가로 생각할 질문과 확인 항목을 제공합니다.

## 주요 기능

학생:

- Google 로그인과 학생 권한 확인
- 6단계 프로젝트 기획안 작성
- Firestore 임시 저장, 다시 열기, 최종 제출
- 교사 수정 요청 확인, 수정 및 재제출
- AI 기획 내용 검토와 하드웨어 구성 검토
- Word DOCX 다운로드

교사:

- `users/{uid}.role` 기반 접근 제어
- 전체 프로젝트 통계, 검색, 필터 및 정렬
- 상세 기획안과 AI 기록 열람
- 수정 요청, 승인 및 피드백 읽음 상태 확인
- 프로젝트 다중 선택과 강한 확인 기반 삭제
- 학생 기획안 Word 다운로드

## 사용 기술

- Vite, Vanilla JavaScript
- Firebase Authentication, Cloud Firestore
- Firebase Admin SDK
- Netlify Functions
- OpenAI Responses API
- `docx`

## 프로젝트 구조

```text
index.html                 로그인 및 역할별 시작 화면
student.html               학생용 다중 페이지 진입점
teacher.html               교사용 다중 페이지 진입점
src/main.js                학생 편집기와 랜딩 화면 로직
src/student.js             학생 페이지 인증 진입점
src/teacher.js             교사 대시보드
src/firebase/              Firebase 조회·저장·검토 서비스
src/components/            화면 컴포넌트
src/services/              OpenAI 및 DOCX 서비스
src/utils/                 매핑, 검증, 정규화 유틸리티
netlify/functions/         서버 전용 OpenAI·역할 확인 함수
firestore.rules            Firestore 보안 규칙
```

## 로컬 설치

```bash
npm install
npx netlify dev
```

Netlify Functions까지 포함한 로컬 테스트는 `npm run dev`가 아니라 `npx netlify dev`를 사용합니다.

프로덕션 빌드:

```bash
npm run build
```

## 환경변수

`.env.example`을 `.env`로 복사하고 로컬 값만 입력합니다. `.env`와 `.env.*`는 Git에서 제외됩니다.

클라이언트 빌드용:

```dotenv
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
VITE_FIREBASE_MEASUREMENT_ID=
```

`VITE_FIREBASE_MEASUREMENT_ID`는 선택값입니다.

Netlify Function 서버 전용:

```dotenv
OPENAI_API_KEY=
```

교사 사전 승인 확인 함수에는 다음 중 한 방식의 Firebase Admin 설정이 필요합니다.

```dotenv
FIREBASE_SERVICE_ACCOUNT=
```

또는:

```dotenv
FIREBASE_ADMIN_PROJECT_ID=
FIREBASE_ADMIN_CLIENT_EMAIL=
FIREBASE_ADMIN_PRIVATE_KEY=
```

서버 전용 값에는 절대로 `VITE_` 접두사를 붙이지 마세요. 실제 키, 서비스 계정 JSON과 개인 이메일은 저장소에 커밋하지 않습니다.

## Firebase 설정

1. Firebase 웹 앱을 만들고 Authentication에서 Google 공급자를 활성화합니다.
2. Cloud Firestore를 생성합니다.
3. [firestore.rules](./firestore.rules)를 Firestore Database → 규칙 탭에 붙여 넣고 게시합니다.
4. 교사 계정은 `teachers` 컬렉션에 서버 또는 Firebase Console에서 사전 등록합니다.
5. 로그인 후 생성된 `users/{uid}` 문서의 role 결과를 확인합니다.

주요 컬렉션:

- `users/{uid}`: 공개 프로필과 `student | teacher` role
- `teachers/{teacherId}`: 교사 승인 이메일과 활성 상태
- `projects/{projectId}`: 기획 데이터, AI 결과, 교사 검토와 과정 기록

## Firestore 복합 색인

학생 프로젝트 목록:

| 컬렉션 | 필드 | 정렬 |
|---|---|---|
| `projects` | `ownerId` | 오름차순 |
| `projects` | `updatedAt` | 내림차순 |

교사 사전 승인 쿼리에서 색인 생성 안내가 나타나는 경우:

| 컬렉션 | 필드 | 정렬 |
|---|---|---|
| `teachers` | `email` | 오름차순 |
| `teachers` | `active` | 오름차순 |

교사 전체 프로젝트 조회의 `updatedAt` 단일 필드 정렬은 기본 단일 필드 색인을 사용합니다. Firestore가 제공하는 색인 생성 링크가 표시되면 프로젝트가 연결된 Firebase Console에서 생성합니다.

## Netlify 배포

`netlify.toml`은 다음 설정을 사용합니다.

- build command: `npm run build`
- publish directory: `dist`
- functions directory: `netlify/functions`

Netlify 사이트 설정의 환경변수에 위의 Vite, OpenAI 및 Firebase Admin 변수를 등록하고 새로 배포합니다. 이 프로젝트는 실제 `index.html`, `student.html`, `teacher.html`을 사용하는 다중 페이지 앱이므로 전체 경로를 `index.html`로 보내는 SPA fallback을 추가하지 않습니다.

배포 후 Firebase Console에서 다음을 설정합니다.

1. Authentication → 설정 → 승인된 도메인
2. 실제 Netlify 사이트 도메인 추가
3. 커스텀 도메인을 사용하면 해당 도메인도 추가
4. `localhost`는 개발용으로 유지

## 테스트 계정

- 일반 Google 계정으로 로그인해 학생 role과 자신의 프로젝트만 조회되는지 확인합니다.
- 별도의 Google 계정 이메일을 `teachers`에 활성 상태로 등록해 교사 흐름을 확인합니다.
- 실제 계정 이메일이나 UID를 문서와 소스 코드에 기록하지 않습니다.

## 보안 주의사항

- OpenAI API 키와 Firebase Admin 자격 증명은 Netlify Function에서만 사용합니다.
- 클라이언트 소스와 Word 문서에 UID, 토큰, API 키 또는 Firebase 설정 객체를 출력하지 않습니다.
- 교사 role과 프로젝트 접근은 UI뿐 아니라 Firestore 규칙에서도 제한합니다.
- Firestore 규칙은 수정 후 자동 배포되지 않으므로 Console에서 직접 게시해야 합니다.

## 알려진 한계

- AI 검토 품질과 응답 시간은 OpenAI 계정 한도와 네트워크 상태에 영향을 받습니다.
- 교사 대시보드는 실시간 리스너가 아니라 수동 새로고침을 사용합니다.
- 브라우저 기반 통합 테스트와 Firestore Rules Emulator 자동화는 아직 포함되어 있지 않습니다.
- 오래된 문서는 읽을 때 정규화하지만 Firestore 원본을 자동 마이그레이션하지 않습니다.

## 향후 개선 방향

- Firestore Emulator 기반 보안 규칙 테스트
- 핵심 학생·교사 흐름의 브라우저 E2E 테스트
- 대시보드 선택적 실시간 갱신
- 접근성 자동 검사와 성능 예산 추가
