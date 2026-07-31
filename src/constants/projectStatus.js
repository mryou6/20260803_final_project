export const PROJECT_STATUS = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  REVISION_REQUESTED: 'revision_requested',
  RESUBMITTED: 'resubmitted',
  APPROVED: 'approved',
})

export const PROJECT_STATUSES = Object.freeze(Object.values(PROJECT_STATUS))

export const PROJECT_STATUS_LABELS = Object.freeze({
  [PROJECT_STATUS.DRAFT]: '작성 중',
  [PROJECT_STATUS.SUBMITTED]: '검토 대기',
  [PROJECT_STATUS.REVISION_REQUESTED]: '수정 요청',
  [PROJECT_STATUS.RESUBMITTED]: '재검토 대기',
  [PROJECT_STATUS.APPROVED]: '승인 완료',
})

export const STATUS_CARD_FILTERS = Object.freeze([
  { key: 'all', label: '전체 프로젝트' },
  { key: PROJECT_STATUS.SUBMITTED, label: '검토 대기' },
  { key: PROJECT_STATUS.REVISION_REQUESTED, label: '수정 요청' },
  { key: PROJECT_STATUS.APPROVED, label: '승인 완료' },
])

export const isEditableProjectStatus = (status) =>
  status === PROJECT_STATUS.DRAFT || status === PROJECT_STATUS.REVISION_REQUESTED

export const normalizeProjectStatus = (projectOrStatus) => {
  const project = projectOrStatus && typeof projectOrStatus === 'object' ? projectOrStatus : null
  const rawStatus = project
    ? project.status || project.submissionStatus || project.reviewStatus || ''
    : projectOrStatus ?? ''
  const value = String(rawStatus).trim().toLowerCase()
  const legacy = {
    writing: PROJECT_STATUS.DRAFT,
    in_progress: PROJECT_STATUS.DRAFT,
    '작성 중': PROJECT_STATUS.DRAFT,
    pending: PROJECT_STATUS.SUBMITTED,
    review_pending: PROJECT_STATUS.SUBMITTED,
    under_review: PROJECT_STATUS.SUBMITTED,
    '검토 대기': PROJECT_STATUS.SUBMITTED,
    resubmitted: PROJECT_STATUS.SUBMITTED,
    re_review: PROJECT_STATUS.SUBMITTED,
    resubmit: PROJECT_STATUS.SUBMITTED,
    resubmission: PROJECT_STATUS.SUBMITTED,
    returned: PROJECT_STATUS.REVISION_REQUESTED,
    revision: PROJECT_STATUS.REVISION_REQUESTED,
    revisionrequested: PROJECT_STATUS.REVISION_REQUESTED,
    rejected: PROJECT_STATUS.REVISION_REQUESTED,
    '수정 요청': PROJECT_STATUS.REVISION_REQUESTED,
    completed: PROJECT_STATUS.APPROVED,
    '승인 완료': PROJECT_STATUS.APPROVED,
  }
  return legacy[value] ?? (PROJECT_STATUSES.includes(value) ? value : 'unknown')
}

export function normalizeTitle(title = '') {
  return String(title).trim().replace(/\s+/g, '').toLowerCase()
}

export const getProjectTitle = (item = {}) => item.title
  || item.projectTitle
  || item.projectName
  || item.formData?.title
  || item.formData?.projectTitle
  || item.formData?.basicInfo?.title
  || item.formData?.projectState?.basic?.projectName
  || ''

export function getDraftIdentity(item = {}) {
  return String(item.projectId
    || item.legacyProjectId
    || item.sourceProjectId
    || (item.draftSource === 'legacy-project' ? item.id : '')
    || `${item.ownerId || ''}:${normalizeTitle(getProjectTitle(item))}`)
}

export function isSameDraftProject(a = {}, b = {}) {
  const sameExplicitId = Boolean(a.projectId && b.projectId) && String(a.projectId) === String(b.projectId)
  const sameLegacyId = Boolean(a.legacyProjectId && b.legacyProjectId)
    && String(a.legacyProjectId) === String(b.legacyProjectId)
  const normalizedA = normalizeTitle(getProjectTitle(a))
  const sameOwnerAndTitle = Boolean(a.ownerId && b.ownerId)
    && String(a.ownerId) === String(b.ownerId)
    && normalizedA !== ''
    && normalizedA === normalizeTitle(getProjectTitle(b))
  const isDraftLegacyPair = (a.sourceCollection === 'drafts' && b.sourceCollection === 'projects')
    || (a.sourceCollection === 'projects' && b.sourceCollection === 'drafts')
  return sameExplicitId || sameLegacyId || (sameOwnerAndTitle && isDraftLegacyPair)
}

function timestampMillis(value) {
  if (typeof value?.toMillis === 'function') return value.toMillis()
  if (typeof value?.toDate === 'function') return value.toDate().getTime()
  if (value instanceof Date) return value.getTime()
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? 0 : parsed
}

export function getSavedTimestamp(item = {}) {
  return [item.updatedAt, item.lastSavedAt, item.savedAt, item.createdAt]
    .reduce((latest, value) => timestampMillis(value) > timestampMillis(latest) ? value : latest, null)
}

export function getSavedTime(item = {}) {
  return timestampMillis(getSavedTimestamp(item))
}

const isMissingDraftValue = (value) => value == null
  || value === ''
  || (Array.isArray(value) && value.length === 0)

export function supplementDraftData(newer, older) {
  if (isMissingDraftValue(newer)) return older
  if (Array.isArray(newer) || typeof newer !== 'object' || newer instanceof Date
    || typeof newer?.toMillis === 'function' || typeof newer?.toDate === 'function') return newer
  if (!older || typeof older !== 'object' || Array.isArray(older)) return newer
  const result = { ...newer }
  Object.entries(older).forEach(([key, value]) => {
    result[key] = key in result ? supplementDraftData(result[key], value) : value
  })
  return result
}

export function deduplicateDrafts(items = []) {
  const deduplicated = []
  for (const item of items) {
    const sourceCollection = item.sourceCollection
      || (item.draftSource === 'legacy-project' ? 'projects' : 'drafts')
    const source = { collection: sourceCollection, documentId: item.id }
    const candidate = {
      ...item,
      sourceCollection,
      draftIdentity: getDraftIdentity(item),
      linkedDraftSources: [source],
    }
    const existingIndex = deduplicated.findIndex((existing) => isSameDraftProject(existing, candidate))
    if (existingIndex < 0) {
      deduplicated.push(candidate)
      continue
    }
    const existing = deduplicated[existingIndex]
    const updatedDifference = timestampMillis(candidate.updatedAt) - timestampMillis(existing.updatedAt)
    const savedDifference = timestampMillis(candidate.lastSavedAt) - timestampMillis(existing.lastSavedAt)
    const candidateWins = updatedDifference > 0
      || (updatedDifference === 0 && savedDifference > 0)
      || (updatedDifference === 0 && savedDifference === 0
        && candidate.sourceCollection === 'drafts' && existing.sourceCollection !== 'drafts')
    const newer = candidateWins ? candidate : existing
    const older = newer === candidate ? existing : candidate
    const merged = supplementDraftData(newer, older)
    merged.formData = supplementDraftData(newer.formData || {}, older.formData || {})
    merged.linkedDraftSources = [...older.linkedDraftSources, ...newer.linkedDraftSources]
      .filter((entry, index, all) => all.findIndex((other) => other.collection === entry.collection && other.documentId === entry.documentId) === index)
    merged.displaySavedAt = newer.updatedAt ?? newer.lastSavedAt ?? newer.savedAt ?? newer.createdAt
    deduplicated[existingIndex] = merged
  }
  return deduplicated
}

export function classifyStudentDashboardProjects(drafts = [], projects = []) {
  const draftDocuments = Array.isArray(drafts) ? drafts : []
  const normalizedProjects = (Array.isArray(projects) ? projects : [])
    .map((project) => ({ ...project, status: normalizeProjectStatus(project) }))
  const legacyDraftProjects = normalizedProjects
    .filter((project) => project.status === PROJECT_STATUS.DRAFT)
  const combinedDrafts = [
    ...draftDocuments.map((draft) => ({ ...draft, draftSource: 'drafts', sourceCollection: 'drafts' })),
    ...legacyDraftProjects.map((project) => ({ ...project, draftSource: 'legacy-project', sourceCollection: 'projects' })),
  ]
  const deduplicatedDrafts = deduplicateDrafts(combinedDrafts)
  console.table(combinedDrafts.map((item) => ({
    sourceCollection: item.sourceCollection,
    documentId: item.id,
    projectId: item.projectId ?? '',
    legacyProjectId: item.legacyProjectId ?? '',
    sourceProjectId: item.sourceProjectId ?? '',
    ownerId: item.ownerId ?? '',
    title: getProjectTitle(item),
    normalizedTitle: normalizeTitle(getProjectTitle(item)),
    currentStep: item.currentStep ?? '',
    updatedAt: item.updatedAt ?? '',
    lastSavedAt: item.lastSavedAt ?? '',
  })))
  console.table(deduplicatedDrafts.map((item) => ({
    sourceCollection: item.sourceCollection,
    documentId: item.id,
    projectId: item.projectId ?? '',
    legacyProjectId: item.legacyProjectId ?? '',
    sourceProjectId: item.sourceProjectId ?? '',
    ownerId: item.ownerId ?? '',
    title: getProjectTitle(item),
    normalizedTitle: normalizeTitle(getProjectTitle(item)),
    currentStep: item.currentStep ?? '',
    updatedAt: item.updatedAt ?? '',
    lastSavedAt: item.lastSavedAt ?? '',
  })))
  const submittedProjects = normalizedProjects.filter((project) => project.status === PROJECT_STATUS.SUBMITTED)
  const revisionProjects = normalizedProjects.filter((project) => project.status === PROJECT_STATUS.REVISION_REQUESTED)
  const approvedProjects = normalizedProjects.filter((project) => project.status === PROJECT_STATUS.APPROVED)
  return {
    draftProjects: deduplicatedDrafts,
    deduplicatedDrafts,
    submittedProjects,
    revisionProjects,
    approvedProjects,
    visibleSubmittedProjects: [...submittedProjects, ...revisionProjects, ...approvedProjects],
    legacyDraftProjects,
  }
}
