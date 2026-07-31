import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizeProjectStatus } from '../src/constants/projectStatus.js'
import { normalizeProjectData } from '../src/utils/dataNormalizer.js'
import { normalizeReviewHistory } from '../src/firebase/teacherReviewService.js'
import { createTeacherFeedbackCard } from '../src/components/teacherFeedbackCard.js'

const expectedStatuses = {
  writing: 'draft',
  pending: 'submitted',
  review_pending: 'submitted',
  returned: 'revision_requested',
  revision: 'revision_requested',
  revisionRequested: 'revision_requested',
  rejected: 'revision_requested',
  resubmitted: 'resubmitted',
  approved: 'approved',
}
for (const [legacy, expected] of Object.entries(expectedStatuses)) {
  assert.equal(normalizeProjectStatus(legacy), expected)
}

const normalized = normalizeProjectData({
  status: 'returned',
  lastTeacherFeedback: {
    message: '센서 테스트 기준을 더 구체적으로 작성하세요.',
    readByStudent: false,
  },
  teacherReview: {
    checklist: { goalAndCriteria: false },
    reviewedBy: { displayName: '검토 교사' },
    reviewedAt: new Date('2026-07-31T01:00:00Z'),
  },
})
assert.equal(normalized.status, 'revision_requested')
assert.equal(normalized.teacherReview.feedback, '센서 테스트 기준을 더 구체적으로 작성하세요.')

const feedbackHtml = createTeacherFeedbackCard(normalized)
assert.match(feedbackHtml, /교사의 검토 의견/)
assert.match(feedbackHtml, /센서 테스트 기준/)
assert.match(feedbackHtml, /검토 교사/)

const history = normalizeReviewHistory([
  { action: 'revision_requested', reviewedAt: '2026-07-31T01:00:00Z' },
  { action: 'resubmitted', createdAt: '2026-07-31T02:00:00Z' },
])
assert.equal(history[0].action, 'resubmitted')
assert.equal(history[1].action, 'revision_requested')

const reviewService = await readFile(new URL('../src/firebase/teacherReviewService.js', import.meta.url), 'utf8')
for (const required of [
  "status: action",
  "lastTeacherFeedback:",
  "transaction.set(historyRef",
  "transaction.set(notificationRef",
  "type: 'revision_requested'",
  "studentRead: false",
]) assert.ok(reviewService.includes(required), `검토 저장 코드 누락: ${required}`)

const rules = await readFile(new URL('../firestore.rules', import.meta.url), 'utf8')
for (const required of [
  '"revision_requested"',
  '"resubmitted"',
  '"lastTeacherFeedback"',
  'match /reviewHistory/{reviewId}',
  'match /notifications/{notificationId}',
]) assert.ok(rules.includes(required), `보안 규칙 누락: ${required}`)

console.log('검토 워크플로 검증 성공: 상태 호환, 피드백 표시, 재제출 이력, 저장 구조, 보안 규칙 통과')
