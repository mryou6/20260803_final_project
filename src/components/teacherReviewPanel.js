import { escapeHtml } from '../utils/helpers.js'
import { reviewChecklistLabels, normalizeReviewHistory } from '../firebase/teacherReviewService.js'
import { PROJECT_STATUS_LABELS } from '../constants/projectStatus.js'
import { formatDateTime, toDate } from '../utils/dataNormalizer.js'

const statusLabels = PROJECT_STATUS_LABELS
const formatDate = (value) => formatDateTime(value)
const durationText = (from, to = new Date()) => {
  const start = toDate(from)
  const end = toDate(to)
  if (!start || !end) return '날짜 정보 없음'
  const minutes = Math.max(0, Math.round((end - start) / 60000))
  const hours = Math.floor(minutes / 60)
  return hours ? `${hours}시간 ${minutes % 60}분` : `${minutes}분`
}

export function createTeacherReviewPanel(project) {
  const review = project.teacherReview ?? {}
  const checklist = review.checklist ?? {}
  const notification = review.notification ?? {}
  const enabled = ['submitted', 'resubmitted'].includes(project.status)
  const revisionRequested = project.status === 'revision_requested'
  const approvalEnabled = ['submitted', 'resubmitted'].includes(project.status)
  const guide = project.status === 'draft'
    ? '아직 학생이 최종 제출하지 않은 프로젝트입니다.'
    : project.status === 'approved' ? '승인 완료된 프로젝트입니다.' : ''
  const history = normalizeReviewHistory(project.reviewHistory)
  const updatedAt = typeof project.updatedAt?.toDate === 'function' ? project.updatedAt.toDate() : project.updatedAt
  const version = updatedAt instanceof Date && !Number.isNaN(updatedAt.getTime()) ? updatedAt.toISOString() : ''
  return `<section class="teacher-review-panel" data-review-project="${escapeHtml(project.id)}" data-expected-status="${escapeHtml(project.status)}" data-expected-updated-at="${escapeHtml(version)}">
    <h3>교사 검토</h3>
    <dl class="detail-grid">
      <div><dt>현재 상태</dt><dd>${statusLabels[project.status] ?? '-'}</dd></div>
      <div><dt>학생의 마지막 제출일</dt><dd>${formatDate(project.submittedAt)}</dd></div>
      <div><dt>이전 수정 요청 횟수</dt><dd>${Number(review.revisionCount) || 0}회</dd></div>
      <div><dt>이전 교사 피드백</dt><dd>${escapeHtml(String(review.feedback || '이전 피드백이 없습니다.'))}</dd></div>
      <div><dt>수정 요청 전송</dt><dd>${formatDate(notification.createdAt)}</dd></div>
      <div><dt>학생 확인</dt><dd>${review.studentRead === true ? '학생 확인 완료' : project.status === 'revision_requested' ? '읽지 않음' : '-'}</dd></div>
      <div><dt>확인 시각</dt><dd>${notification.isRead === true ? formatDate(notification.readAt) : '-'}</dd></div>
      ${project.status === 'resubmitted' ? `<div><dt>학생 재제출</dt><dd>${formatDate(project.resubmittedAt)}</dd></div>` : ''}
      ${project.status === 'revision_requested' && project.revisionInProgress === true ? `<div><dt>수정 진행</dt><dd>학생 수정 중</dd></div>` : ''}
      <div><dt>${notification.isRead === true ? '확인까지 걸린 시간' : '경과'}</dt><dd>${notification.createdAt ? durationText(notification.createdAt, notification.isRead === true ? notification.readAt : new Date()) : '-'}</dd></div>
    </dl>
    <fieldset class="review-checklist" ${enabled ? '' : 'disabled'}><legend>검토 체크리스트</legend>
      <label class="review-select-all"><input type="checkbox" data-review-select-all aria-label="검토 체크리스트 전체 선택"> <span>전체 선택</span></label>
      ${Object.entries(reviewChecklistLabels).map(([key, label]) => `<label><input type="checkbox" name="${key}" ${checklist[key] ? 'checked' : ''}> <span>${label}</span></label>`).join('')}
    </fieldset>
    <label class="review-feedback"><span>종합 피드백</span><textarea rows="5" placeholder="수정할 내용이나 승인 의견을 입력하세요." ${enabled ? '' : 'disabled'}>${escapeHtml(String(review.feedback || ''))}</textarea></label>
    ${guide ? `<p class="review-guide">${guide}</p>` : ''}
    <div class="review-actions">
      <button class="button button-secondary" type="button" data-action="request-revision" data-project-id="${escapeHtml(project.id)}" ${enabled ? '' : 'disabled'}>${revisionRequested ? '수정 요청 완료' : '수정 요청'}</button>
      <button class="button button-primary" type="button" data-action="approve-project" data-project-id="${escapeHtml(project.id)}" ${approvalEnabled ? '' : 'disabled'}>${project.status === 'approved' ? '승인 완료됨' : '승인 완료'}</button>
    </div>
    <div class="review-message" aria-live="polite"></div>
    <div class="review-history"><h3>검토 이력</h3>${history.length ? history.map((item) => `<article>
      <div><strong>${item.action === 'approved' ? '승인 완료' : item.action === 'resubmitted' ? '학생 재제출' : '수정 요청'}</strong><time>${formatDate(item.reviewedAt)}</time></div>
      <p>${escapeHtml(item.reviewerName)} · ${escapeHtml(item.feedback || '피드백 없음')}</p>
      <ul>${Object.entries(item.checklist).filter(([, checked]) => checked).map(([key]) => `<li>${reviewChecklistLabels[key]}</li>`).join('')}</ul>
    </article>`).join('') : '<p>아직 교사 검토 이력이 없습니다.</p>'}</div>
  </section>`
}

export function readTeacherReviewForm(panel) {
  return {
    feedback: panel?.querySelector('.review-feedback textarea')?.value.trim() ?? '',
    expectedStatus: panel?.dataset.expectedStatus ?? '',
    expectedUpdatedAt: panel?.dataset.expectedUpdatedAt ?? '',
    checklist: Object.fromEntries(Object.keys(reviewChecklistLabels).map((key) => [
      key, panel?.querySelector(`[name="${key}"]`)?.checked === true,
    ])),
  }
}
