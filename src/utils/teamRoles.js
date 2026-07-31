export const teamRoleOptions = [
  ['code', '코드 작성'],
  ['circuit', '회로 구현'],
  ['exterior', '외형 구현'],
  ['partsResearch', '부품 조사'],
  ['testing', '기능 테스트'],
  ['debugging', '디버깅'],
  ['presentationMaterial', '발표 자료 제작'],
  ['presentation', '발표'],
  ['report', '보고서 작성'],
  ['projectManagement', '프로젝트 관리'],
  ['other', '기타'],
]

const roleLabels = Object.fromEntries(teamRoleOptions)
const roleTypes = Object.fromEntries(teamRoleOptions.map(([type, label]) => [label, type]))

export function normalizeTeamRole(item = {}) {
  const legacyRole = typeof item === 'string' ? item : String(item?.role ?? '').trim()
  const savedType = typeof item === 'object' ? String(item?.roleType ?? '').trim() : ''
  const savedTypes = Array.isArray(item?.roleTypes) ? item.roleTypes.filter((type) => roleLabels[type]) : []
  const legacyLabels = legacyRole.split(/\s*[,/]\s*/).filter(Boolean)
  const mappedLegacyTypes = legacyLabels.map((label) => roleTypes[label]).filter(Boolean)
  const knownType = roleLabels[savedType] ? savedType : roleTypes[legacyRole]
  const normalizedTypes = [...new Set([...savedTypes, ...mappedLegacyTypes, ...(knownType ? [knownType] : [])])]
  const roleTypesValue = normalizedTypes.length ? normalizedTypes : legacyRole ? ['other'] : []
  return {
    member: String(typeof item === 'object' ? item?.member ?? item?.memberName ?? item?.name ?? '' : '').trim(),
    roleTypes: roleTypesValue,
    roleType: roleTypesValue[0] ?? '',
    customRole: String(typeof item === 'object' ? item?.customRole ?? '' : '').trim()
      || (roleTypesValue.includes('other') && legacyRole && !mappedLegacyTypes.length && legacyRole !== '기타' ? legacyRole : ''),
  }
}

export function getTeamRoleLabel(item = {}) {
  const normalized = normalizeTeamRole(item)
  return normalized.roleTypes
    .map((type) => type === 'other' ? normalized.customRole : roleLabels[type])
    .filter(Boolean)
    .join(', ')
}
