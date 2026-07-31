import { escapeHtml } from '../utils/helpers.js'

export function createNotice(message, type = 'info') {
  return `<div class="notice notice-${type}" role="status">${escapeHtml(message)}</div>`
}

const list = (items, empty = '제공된 항목이 없습니다.') =>
  Array.isArray(items) && items.length
    ? `<ul>${items.map((item) => `<li>${escapeHtml(String(item ?? ''))}</li>`).join('')}</ul>`
    : `<p class="ai-empty">${empty}</p>`

const reviewCard = (title, record, fields) => {
  if (!record?.result) return ''
  const result = record.result
  return `<article class="ai-split-review">
    <header><h4>${title}</h4><small>${record.reviewedAt ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(record.reviewedAt)) : ''}</small></header>
    <section><h5>총평</h5><p>${escapeHtml(String(result.summary || '총평이 제공되지 않았습니다.'))}</p></section>
    ${fields.map(([key, label]) => `<section><h5>${label}</h5>${list(result[key])}</section>`).join('')}
  </article>`
}

export function createAiFeedback(projectState, editorState = {}) {
  const ai = projectState.aiInteraction ?? {}
  const planning = reviewCard('기획 내용 검토 결과', ai.planningReview, [
    ['strengths', '잘된 점'], ['questions', '추가 질문'], ['suggestions', '개선 방향'],
  ])
  const hardware = reviewCard('하드웨어 구성 검토 결과', ai.hardwareReview, [
    ['compatibility', '호환성 점검'], ['warnings', '주의 사항'], ['checkItems', '제작 전 확인 항목'],
  ])
  const readOnly = !['draft', 'revision_requested'].includes(editorState.status)
  return `<section class="ai-review-panel" aria-labelledby="ai-review-title">
    <p class="ai-eyebrow">AI PROJECT REVIEW</p><h3 id="ai-review-title">AI 기획안 검토</h3>
    ${editorState.isReviewing ? `<div class="ai-loading" role="status"><span class="ai-spinner"></span>${escapeHtml(editorState.reviewProgress || 'AI가 검토하고 있습니다...')}</div>` : ''}
    ${editorState.aiSaveFailed ? '<div class="notice notice-error">검토 결과는 화면에 유지되었지만 Firestore 저장에 실패했습니다. <button type="button" class="button button-small" data-action="retry-ai-save">저장 다시 시도</button></div>' : ''}
    ${planning || hardware ? `<div class="ai-split-grid">${planning}${hardware}</div>` : '<p>필요한 검토를 선택하면 결과가 이곳에 표시됩니다.</p>'}
    ${readOnly ? '<p class="ai-readonly-message">제출된 프로젝트는 추가 AI 검토를 요청할 수 없습니다.</p>' : ''}
    <p class="ai-disclaimer">AI 검토 결과는 참고 자료입니다. 실제 부품 규격과 회로 연결은 데이터시트와 교사의 확인이 필요합니다.</p>
  </section>`
}
