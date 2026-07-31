import { escapeHtml } from '../utils/helpers.js'

const validName = (value) => {
  if (value === undefined || value === null || typeof value === 'object') return ''
  const result = String(value).trim()
  return result && !/^[,\s]+$/.test(result) && !['undefined', 'null', '[object Object]'].includes(result)
    ? result
    : ''
}

export function getProjectDisplayName(project = {}) {
  const primaryName = validName(project.projectName || project.title)
  return (primaryName === '제목 없는 프로젝트' ? '' : primaryName)
    || validName(project.planningData?.projectName)
    || validName(project.oneLineSummary)
    || '제목 없는 프로젝트'
}

export function createDeleteProjectsModal(projects) {
  const items = Array.isArray(projects) ? projects : []
  const sourceCount = items.reduce((count, item) => count + Math.max(1, item.selectionSources?.length ?? 0), 0)
  const hasLinkedSources = sourceCount > items.length
  return `<div class="delete-modal-backdrop" data-action="cancel-project-delete">
    <section class="delete-modal" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" aria-describedby="delete-modal-description">
      <h2 id="delete-modal-title">선택한 프로젝트를 삭제하시겠습니까?</h2>
      <p><strong>${items.length}개</strong> 프로젝트가 선택되었습니다. 임시저장 프로젝트와 제출 프로젝트가 함께 포함될 수 있습니다.</p>
      <ul>${items.map((project) => `<li>${escapeHtml(getProjectDisplayName(project))}</li>`).join('')}</ul>
      <p id="delete-modal-description" class="delete-warning">${hasLinkedSources ? `병합된 행의 연결 문서를 포함해 총 ${sourceCount}개 원본 문서가 함께 삭제됩니다.<br>` : ''}삭제된 프로젝트는 복구할 수 없습니다.<br>정말 삭제하시려면 아래 입력창에 ‘삭제’를 입력해 주세요.</p>
      <label><span>삭제 확인 문구</span><input type="text" data-delete-confirm autocomplete="off" placeholder="삭제" /></label>
      <div class="delete-modal-actions">
        <button class="button" type="button" data-action="cancel-project-delete">취소</button>
        <button class="button button-danger" type="button" data-action="confirm-project-delete" disabled>영구 삭제</button>
      </div>
      <p class="delete-result" role="alert" aria-live="assertive"></p>
    </section>
  </div>`
}

export function trapDeleteModalFocus(event, modal) {
  if (event.key !== 'Tab' || !modal) return
  const focusable = [...modal.querySelectorAll('button:not([disabled]), input:not([disabled])')]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
