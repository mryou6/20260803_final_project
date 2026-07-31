import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { normalizeProjectStatus, STATUS_CARD_FILTERS } from '../src/constants/projectStatus.js'
import { getTeacherDashboardStats } from '../src/firebase/teacherProjectService.js'

assert.deepEqual(
  STATUS_CARD_FILTERS.map(({ key }) => key),
  ['all', 'submitted', 'revision_requested', 'approved'],
)
assert.equal(normalizeProjectStatus('pending'), 'submitted')
assert.equal(normalizeProjectStatus('review_pending'), 'submitted')
assert.equal(normalizeProjectStatus('revision'), 'revision_requested')
assert.equal(normalizeProjectStatus('revisionRequested'), 'revision_requested')

const stats = getTeacherDashboardStats([
  { status: 'draft', progress: 20, aiCallCount: 1 },
  { status: 'submitted', progress: 40, aiCallCount: 2 },
  { status: 'revision_requested', progress: 60, aiCallCount: 3, teacherReview: { studentRead: false } },
  { status: 'resubmitted', progress: 80, aiCallCount: 4 },
  { status: 'approved', progress: 100, aiCallCount: 5 },
])
assert.equal(stats.total, 5)
assert.equal(stats.submitted, 1)
assert.equal(stats.returned, 1)
assert.equal(stats.approved, 1)
assert.equal(stats.aiCallCount, 15)

const source = await readFile(new URL('../src/teacher.js', import.meta.url), 'utf8')
for (const required of [
  'data-status-card',
  'aria-pressed',
  'setStatusFilter',
  'updateStatusUrl',
  'reset-status-filter',
  'subscribeAllProjectsForTeacher',
]) assert.ok(source.includes(required), `상태 카드 구현 누락: ${required}`)
assert.match(source, /if \(key === 'status'\) setStatusFilter/)

const css = await readFile(new URL('../src/teacher.css', import.meta.url), 'utf8')
for (const required of [
  '.summary-card-filter:hover',
  '.summary-card-filter:focus-visible',
  '.summary-card-filter.is-active',
  'repeat(5, minmax(0, 1fr))',
]) assert.ok(css.includes(required), `상태 카드 스타일 누락: ${required}`)

console.log('교사 상태 카드 검증 성공: 통계, 필터 동기화, URL, 접근성, 실시간 갱신, 반응형 스타일 통과')
