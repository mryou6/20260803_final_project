# Arduino Project Studio AI 배포 체크리스트

## 로컬 및 Firebase

- [ ] `npm install` 완료
- [ ] `.env` 로컬 설정
- [ ] `.env` Git 제외 확인
- [ ] Firebase 웹 앱 설정
- [ ] Google 로그인 활성화
- [ ] Firestore 생성
- [ ] `users` 교사 role 확인
- [ ] `teachers` 사전 승인 등록
- [ ] Firestore 보안 규칙 게시
- [ ] `projects(ownerId ASC, updatedAt DESC)` 복합 색인 사용 설정
- [ ] 필요 시 `teachers(email ASC, active ASC)` 색인 생성
- [ ] `npm run build` 성공
- [ ] `dist/index.html` 생성 확인
- [ ] `dist/student.html` 생성 확인
- [ ] `dist/teacher.html` 생성 확인
- [ ] `npx netlify dev` 테스트

## 배포

- [ ] GitHub push
- [ ] Netlify Vite 환경변수 등록
- [ ] Netlify `OPENAI_API_KEY` 등록
- [ ] Firebase Admin 환경변수 등록
- [ ] Netlify 배포
- [ ] Firebase 승인된 도메인에 Netlify 도메인 등록
- [ ] 커스텀 도메인 사용 시 Firebase 승인 도메인 추가

## 배포 후 기능

- [ ] 배포 주소 Google 로그인 테스트
- [ ] 학생 새 프로젝트·저장·다시 열기 테스트
- [ ] 학생 AI 기획 내용 검토 테스트
- [ ] 학생 AI 하드웨어 검토 테스트
- [ ] 학생 Word 다운로드·최종 제출 테스트
- [ ] 교사 전체 조회·검색·필터·정렬 테스트
- [ ] 교사 수정 요청·학생 확인·재제출 테스트
- [ ] 교사 승인 테스트
- [ ] 교사 다중 선택·삭제 테스트
- [ ] 승인 프로젝트 Word 다운로드 테스트
