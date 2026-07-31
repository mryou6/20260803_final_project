// Firestore 저장 전에 지원하지 않는 값과 undefined를 재귀적으로 제거합니다.
const OMIT = Symbol('omit')

export function sanitizeForFirestore(value) {
  const visited = new WeakSet()

  const sanitize = (current, inArray = false) => {
    if (current === undefined) return inArray ? null : OMIT
    if (current === null || typeof current === 'string' || typeof current === 'boolean') return current
    if (typeof current === 'number') return Number.isFinite(current) ? current : 0
    if (typeof current === 'function' || typeof current === 'symbol' || typeof current === 'bigint') {
      return inArray ? null : OMIT
    }
    if (current instanceof Date) return Number.isNaN(current.getTime()) ? null : current.toISOString()
    if (typeof HTMLElement !== 'undefined' && current instanceof HTMLElement) return inArray ? null : OMIT
    if (typeof Event !== 'undefined' && current instanceof Event) return inArray ? null : OMIT
    if (typeof current !== 'object') return String(current)
    if (visited.has(current)) return inArray ? null : OMIT

    visited.add(current)
    if (Array.isArray(current)) {
      return current.map((item) => sanitize(item, true))
    }

    const output = {}
    Object.entries(current).forEach(([key, item]) => {
      const safeValue = sanitize(item)
      if (safeValue !== OMIT) output[key] = safeValue
    })
    return output
  }

  const sanitized = sanitize(value)
  return sanitized === OMIT ? null : sanitized
}
