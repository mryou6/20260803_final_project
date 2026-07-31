import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Packer } from 'docx'
import JSZip from 'jszip'
import { normalizeProjectStatus } from '../src/constants/projectStatus.js'
import { createProjectPlanDocument } from '../src/services/documentService.js'

assert.equal(normalizeProjectStatus('re_review'), 'resubmitted')
assert.equal(normalizeProjectStatus('completed'), 'approved')

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')
const [projectService, reviewService, main, rules] = await Promise.all([
  read('src/firebase/projectService.js'),
  read('src/firebase/teacherReviewService.js'),
  read('src/main.js'),
  read('firestore.rules'),
])

for (const required of [
  'revisionInProgress: true',
  "status: wasReturned ? 'resubmitted' : 'submitted'",
  "action: 'resubmitted'",
  "actorType: 'student'",
  "type: 'project_resubmitted'",
  'revisionNumber:',
]) assert.ok(projectService.includes(required), `재제출 저장 누락: ${required}`)

for (const required of [
  'approvedByName: reviewerName',
  "actorType: 'teacher'",
  "type: 'project_approved'",
  "title: '기획안 승인 완료'",
]) assert.ok(reviewService.includes(required), `승인 저장 누락: ${required}`)

assert.ok(main.includes('기획안 수정하기'))
assert.ok(main.includes('수정 완료 및 재제출'))
assert.ok(main.includes('제출 내용 보기'))
assert.ok(main.includes('승인된 기획안 보기'))

for (const required of [
  '"revisionInProgress"',
  '"revisionStartedAt"',
  '"approvedByName"',
  '"project_resubmitted"',
  '"project_approved"',
]) assert.ok(rules.includes(required), `보안 규칙 누락: ${required}`)

const document = createProjectPlanDocument({
  status: 'approved',
  basic: { projectName: '승인 검증 프로젝트', teamName: '검증팀' },
  teacherReview: {
    status: 'approved',
    feedback: '최종 검토 결과 구현 계획이 구체적입니다.',
    checklist: {},
    reviewedBy: { displayName: '검토 교사' },
    reviewedAt: new Date('2026-07-31T03:00:00Z'),
    revisionCount: 2,
  },
  approvedByName: '승인 교사',
  approvedAt: new Date('2026-07-31T04:00:00Z'),
}, { displayName: '학생' })
const buffer = await Packer.toBuffer(document)
const zip = await JSZip.loadAsync(buffer)
const xml = await zip.file('word/document.xml').async('string')
for (const expected of [
  '교사 검토 및 승인 정보',
  '승인 완료',
  '승인 교사',
  '최종 검토 의견',
  '최종 검토 결과 구현 계획이 구체적입니다.',
  '수정 요청 횟수',
  '2회',
]) assert.ok(xml.includes(expected), `승인 Word 정보 누락: ${expected}`)

console.log('수정·재제출·승인 검증 성공: 상태, 이력, 알림, 보안 규칙, 승인 Word 통과')
