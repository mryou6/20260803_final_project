import { escapeHtml } from '../utils/helpers.js'
import { normalizeReviewHistory, reviewChecklistLabels } from '../firebase/teacherReviewService.js'
import { formatDateTime } from '../utils/dataNormalizer.js'

const formatDate = (value) => formatDateTime(value)

export function createTeacherFeedbackCard(project) {
  if (!project || !['revision_requested', 'resubmitted', 'approved'].includes(project.status)) return ''
  const review = project.teacherReview ?? {}
  const history = normalizeReviewHistory(project.reviewHistory)
  const unchecked = Object.entries(reviewChecklistLabels).filter(([key]) => review.checklist?.[key] !== true)
  const revisionRequested = project.status === 'revision_requested'
  const resubmitted = project.status === 'resubmitted'
  return `<section class="teacher-feedback-card status-${project.status}" aria-labelledby="teacher-feedback-title">
    <h2 id="teacher-feedback-title">${revisionRequested ? '교사의 검토 의견을 확인하고 기획안을 수정해 주세요.' : resubmitted ? '수정한 기획안을 다시 제출했습니다.' : '프로젝트가 승인되었습니다.'}</h2>
    <dl>
      <div><dt>${project.status === 'approved' ? '승인 교사' : '교사'}</dt><dd>${escapeHtml(String(project.approvedByName || review.requestedByName || review.reviewedBy?.displayName || history[0]?.reviewerName || '교사'))}</dd></div>
      <div><dt>${project.status === 'approved' ? '승인 일시' : '검토 일시'}</dt><dd>${formatDate(project.approvedAt || review.requestedAt || review.reviewedAt || history[0]?.reviewedAt)}</dd></div>
      <div><dt>수정 요청 횟수</dt><dd>${Number(review.revisionCount) || 0}회</dd></div>
    </dl>
    <p class="feedback-text">${escapeHtml(String(review.feedback || '작성된 피드백이 없습니다.'))}</p>
    ${unchecked.length ? `<div><strong>보완이 필요한 항목</strong><ul>${unchecked.map(([, label]) => `<li>${label}</li>`).join('')}</ul></div>` : ''}
    ${revisionRequested ? '<p>피드백을 확인한 뒤 기획안을 수정하고 다시 제출해 주세요.</p>' : ''}
    <details><summary>검토 이력 ${history.length}건</summary>${history.map((item) => `<article><strong>${item.action === 'approved' ? '승인 완료' : item.action === 'resubmitted' ? '학생 재제출' : '수정 요청'}</strong><span>${escapeHtml(item.reviewerName)} · ${formatDate(item.reviewedAt)}</span><p>${escapeHtml(item.feedback || '피드백 없음')}</p></article>`).join('')}</details>
  </section>`
}
