import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [
  roleService,
  projectService,
  reviewService,
  teacherPage,
  rules,
  resolver,
] = await Promise.all([
  read('src/firebase/roleService.js'),
  read('src/firebase/teacherProjectService.js'),
  read('src/firebase/teacherReviewService.js'),
  read('src/teacher.js'),
  read('firestore.rules'),
  read('netlify/functions/resolve-user-role.js'),
])

assert.match(roleService, /doc\(db, 'teachers', user\.uid\)/)
assert.match(roleService, /snapshot\.data\(\)\?\.active === true/)
assert.doesNotMatch(roleService, /where\(['"]email/)

assert.match(projectService, /getDoc\(doc\(db, 'projects', projectId\)\)/)
assert.match(projectService, /collection\(db, 'projects', projectId, 'reviewHistory'\)/)
assert.match(projectService, /교사 권한 또는 Firestore 보안 규칙을 확인해 주세요\./)
for (const label of [
  'currentUser.uid',
  'projectId',
  '교사 문서 존재 여부',
  'Firestore error code',
  'error message',
]) assert.ok(projectService.includes(label), `상세 로그 누락: ${label}`)
assert.doesNotMatch(projectService, /currentUser\.email/)

assert.match(reviewService, /doc\(db, 'teachers', teacherUser\.uid\)/)
assert.match(reviewService, /userSnapshot\.data\(\)\?\.active !== true/)
assert.match(teacherPage, /getProjectDetailForTeacher\(projectId, currentTeacher\)/)

assert.match(rules, /exists\(\/databases\/\$\(database\)\/documents\/teachers\/\$\(request\.auth\.uid\)\)/)
assert.match(rules, /\.data\.active == true/)
assert.match(rules, /request\.auth\.uid == teacherId/)
assert.match(rules, /canRequestRevisionFromCurrentStatus\(\)/)
assert.match(rules, /"pending", "review_pending", "under_review"/)
assert.match(rules, /request\.resource\.data\.reviewedBy\.uid == request\.auth\.uid/)

assert.match(resolver, /collection\('teachers'\)\.doc\(uid\)/)
assert.match(resolver, /transaction\.get\(teacherRef\)/)
assert.match(resolver, /collection\('users'\)\.doc\(uid\)/)
assert.match(resolver, /replace\(\/\\\\n\/g, '\\n'\)/)
assert.match(resolver, /getApps\(\)\.length \? getApp\(\) : initializeApp/)
assert.doesNotMatch(resolver, /\.where\('email'/)

console.log('교사 권한 검증 성공: UID 문서, active 조건, 단일 상세 조회, 하위 이력 조회, 오류 로그 통과')
