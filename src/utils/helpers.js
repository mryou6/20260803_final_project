// 화면에 사용자 입력을 안전하게 표시하기 위한 공통 함수입니다.
export function escapeHtml(value = '') {
  const safeValue = value === null || value === undefined || typeof value === 'object' ? '' : String(value)
  return safeValue
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

export function createId(prefix = 'item') {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`
}
