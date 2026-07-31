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

export const normalizeProjectStatus = (status) => {
  const value = String(status ?? '').trim().toLowerCase()
  const legacy = {
    writing: PROJECT_STATUS.DRAFT,
    pending: PROJECT_STATUS.SUBMITTED,
    review_pending: PROJECT_STATUS.SUBMITTED,
    returned: PROJECT_STATUS.REVISION_REQUESTED,
    revision: PROJECT_STATUS.REVISION_REQUESTED,
    revisionrequested: PROJECT_STATUS.REVISION_REQUESTED,
    rejected: PROJECT_STATUS.REVISION_REQUESTED,
    re_review: PROJECT_STATUS.RESUBMITTED,
    resubmit: PROJECT_STATUS.RESUBMITTED,
    resubmission: PROJECT_STATUS.RESUBMITTED,
    completed: PROJECT_STATUS.APPROVED,
  }
  return PROJECT_STATUSES.includes(value) ? value : legacy[value] ?? PROJECT_STATUS.DRAFT
}
