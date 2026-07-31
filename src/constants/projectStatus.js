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

export function classifyStudentDashboardProjects(drafts = [], projects = []) {
  const draftDocuments = Array.isArray(drafts) ? drafts : []
  const normalizedProjects = (Array.isArray(projects) ? projects : [])
    .map((project) => ({ ...project, status: normalizeProjectStatus(project) }))
  const draftLegacyIds = new Set(draftDocuments
    .flatMap((draft) => [draft.projectId, draft.legacyProjectId])
    .filter(Boolean)
    .map(String))
  const legacyDraftProjects = normalizedProjects
    .filter((project) => project.status === PROJECT_STATUS.DRAFT)
    .filter((project) => !draftLegacyIds.has(String(project.id || project.projectId)))
  const draftProjects = [
    ...draftDocuments.map((draft) => ({ ...draft, draftSource: 'drafts' })),
    ...legacyDraftProjects.map((project) => ({ ...project, draftSource: 'legacy-project' })),
  ]
  const submittedProjects = normalizedProjects.filter((project) => project.status === PROJECT_STATUS.SUBMITTED)
  const revisionProjects = normalizedProjects.filter((project) => project.status === PROJECT_STATUS.REVISION_REQUESTED)
  const approvedProjects = normalizedProjects.filter((project) => project.status === PROJECT_STATUS.APPROVED)
  return {
    draftProjects,
    submittedProjects,
    revisionProjects,
    approvedProjects,
    visibleSubmittedProjects: [...submittedProjects, ...revisionProjects, ...approvedProjects],
    legacyDraftProjects,
  }
}
