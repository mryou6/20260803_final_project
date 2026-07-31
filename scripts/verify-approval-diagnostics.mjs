import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../src/firebase/teacherReviewService.js', import.meta.url), 'utf8')
const panelSource = await readFile(new URL('../src/components/teacherReviewPanel.js', import.meta.url), 'utf8')
const teacherSource = await readFile(new URL('../src/teacher.js', import.meta.url), 'utf8')

assert.match(source, /export const approveProject[\s\S]*reviewProject\(projectId, teacherUser, reviewData, 'approved'\)/)
assert.match(source, /runTransaction\(db/)
assert.doesNotMatch(source, /writeBatch/)
for (const required of [
  "console.group('[교사 승인 진단]')",
  "console.log('projectId:', projectId)",
  "console.log('teacherUid:', currentUser?.uid)",
  "console.log('projectOwnerId:', project?.ownerId)",
  "console.log('currentStatus:', project?.status)",
  "console.log('normalizedStatus:', currentStatus)",
  "console.log('nextStatus:', 'approved')",
  "console.log('projectUpdateKeys:', Object.keys(projectUpdatePayload || {}))",
  "console.log('projectUpdatePayload:', projectUpdatePayload)",
  "console.log('projectPath:', projectRef?.path)",
  "console.log('reviewHistoryPath:', historyRef?.path)",
  "console.log('notificationPath:', notificationRef?.path)",
  "console.log('notificationRecipientId:', project?.ownerId)",
  'console.table(approvalDiagnosis)',
  "console.error('[교사 승인 실패]'",
]) assert.ok(source.includes(required), `승인 진단 로그 누락: ${required}`)

assert.match(source, /transaction\.update\(projectRef, projectUpdatePayload\)/)
assert.match(source, /transaction\.set\(historyRef/)
assert.match(source, /transaction\.set\(notificationRef/)
assert.match(source, /const projectUpdatePayload = action === 'approved'[\s\S]*status: 'approved'[\s\S]*approvedAt: serverTimestamp\(\)[\s\S]*approvedBy: currentUser\.uid[\s\S]*approvedByName: reviewerName[\s\S]*updatedAt: serverTimestamp\(\)/)
assert.match(panelSource, /const approvalEnabled = \['submitted', 'resubmitted'\]\.includes\(project\.status\)/)
assert.ok(panelSource.includes('data-review-select-all'))
assert.ok(teacherSource.includes('selectAll.indeterminate = checkedCount > 0 && checkedCount < items.length'))
assert.ok(teacherSource.includes("selectAll.nextElementSibling.textContent = selectAll.checked ? '전체 해제' : '전체 선택'"))

console.log('교사 승인 진단 검증 성공: 트랜잭션, payload 키, 세 경로, 검증표, 실패 오류 로그 통과')
