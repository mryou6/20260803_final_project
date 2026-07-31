import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizeProjectStatus } from '../src/constants/projectStatus.js'

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [service, main, teacher, rules] = await Promise.all([
  read('src/firebase/projectService.js'),
  read('src/main.js'),
  read('src/teacher.js'),
  read('firestore.rules'),
])

assert.equal(normalizeProjectStatus('resubmit'), 'resubmitted')
assert.equal(normalizeProjectStatus('resubmission'), 'resubmitted')

for (const required of [
  "'teacherReview.studentRead': true",
  "'teacherReview.studentReadAt': serverTimestamp()",
  'feedbackUnread: false',
  "where('recipientId', '==', user.uid)",
  "status: wasReturned ? 'resubmitted' : 'submitted'",
  "type: 'project_resubmitted'",
  "console.debug('[학생 재제출 저장]'",
  "console.error('[학생 재제출 실패]'",
]) assert.ok(service.includes(required), `학생 동기화 코드 누락: ${required}`)

assert.ok(!service.includes("where('projectId', '==', projectId)"), '읽음 처리에 복합 인덱스 의존 조회가 남아 있음')
assert.ok(!service.includes("'lastTeacherFeedback.readByStudent': true"), '읽음 처리에 비표준 map 갱신이 남아 있음')
assert.match(main, /project\.teacherReview\?\.studentRead === true/)
assert.match(teacher, /if \(openDetailProjectId\) void openDetails\(openDetailProjectId, null\)/)

assert.ok(rules.includes('request.resource.data.teacherReview.diff(resource.data.teacherReview).affectedKeys().hasOnly'))
assert.ok(rules.includes('"studentRead", "studentReadAt"'))
assert.ok(rules.includes('"feedbackUnread"'))

console.log('읽음·재제출 동기화 검증 성공: 표준 필드, 인덱스 독립 조회, 진단 로그, 실시간 상세 갱신 통과')
