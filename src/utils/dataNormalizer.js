import { createEmptyProject } from '../data/projectSchema.js'
import { normalizeProjectStatus } from '../constants/projectStatus.js'

const INVALID_TEXT = new Set(['undefined', 'null', '[object Object]', 'nan', 'invalid date'])

export function cleanText(value, fallback = '') {
  if (value === undefined || value === null || typeof value === 'object') return fallback
  const result = String(value).trim()
  return result && !INVALID_TEXT.has(result.toLowerCase()) && !/^[,\s]+$/.test(result) ? result : fallback
}

export function cleanList(value) {
  const values = Array.isArray(value) ? value : cleanText(value) ? String(value).split(/\r?\n|,\s*/) : []
  return values.map((item) => cleanText(item?.name ?? item)).filter(Boolean)
}

export function cleanNumber(value, fallback = 0) {
  const result = Number(value)
  return Number.isFinite(result) ? result : fallback
}

export function cleanBoolean(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

export function toDate(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') {
    try { return value.toDate() } catch { return null }
  }
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

const dateFormatter = (withTime) => new Intl.DateTimeFormat('ko-KR', withTime
  ? { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
  : { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' })

export function formatDateTime(value, fallback = '날짜 정보 없음') {
  const date = toDate(value)
  return date ? dateFormatter(true).format(date) : fallback
}

export function formatDate(value, fallback = '날짜 정보 없음') {
  const date = toDate(value)
  return date ? dateFormatter(false).format(date) : fallback
}

export function formatCurrency(value, fallback = '금액 정보 없음') {
  const result = typeof value === 'string' ? Number(value.replace(/[^\d.-]/g, '')) : Number(value)
  return Number.isFinite(result) ? `${result.toLocaleString('ko-KR')}원` : fallback
}

export function normalizeRole(value) {
  return cleanText(value).toLowerCase() === 'teacher' ? 'teacher' : 'student'
}

export const normalizeStatus = normalizeProjectStatus

export function getProjectDisplayName(project = {}) {
  return cleanText(project.projectName)
    || cleanText(project.basic?.projectName)
    || cleanText(project.planningData?.projectName)
    || cleanText(project.oneLineSummary)
    || cleanText(project.basic?.summary)
    || '제목 없는 프로젝트'
}

export function getStudentDisplayName(project = {}) {
  return cleanText(project.ownerName)
    || cleanList(project.members).join(', ')
    || cleanText(project.user?.displayName)
    || '이름 미입력'
}

export function normalizeProjectData(project = {}, id = '') {
  const empty = createEmptyProject()
  const planningData = { ...empty.planningData, ...(project.planningData ?? {}) }
  const aiInteraction = {
    ...empty.aiInteraction,
    ...(project.aiInteraction ?? {}),
    planningReview: { ...empty.aiInteraction.planningReview, ...(project.aiInteraction?.planningReview ?? {}) },
    hardwareReview: { ...empty.aiInteraction.hardwareReview, ...(project.aiInteraction?.hardwareReview ?? {}) },
  }
  const teacherReview = {
    ...empty.teacherReview,
    ...(project.teacherReview ?? {}),
    checklist: { ...empty.teacherReview.checklist, ...(project.teacherReview?.checklist ?? {}) },
    reviewedBy: { ...empty.teacherReview.reviewedBy, ...(project.teacherReview?.reviewedBy ?? {}) },
    notification: { ...empty.teacherReview.notification, ...(project.teacherReview?.notification ?? {}) },
  }
  teacherReview.feedback = cleanText(
    teacherReview.feedback
      || project.lastTeacherFeedback?.message
      || project.teacherFeedback
      || project.feedback
      || project.review?.feedback
      || project.revisionRequest?.feedback,
  )
  teacherReview.studentRead = teacherReview.studentRead === true
    || teacherReview.notification?.isRead === true
    || project.lastTeacherFeedback?.readByStudent === true
  teacherReview.studentReadAt = teacherReview.studentReadAt
    || teacherReview.notification?.readAt
    || project.lastTeacherFeedback?.readAt
  const rawStep = Math.max(1, Math.round(cleanNumber(project.currentStep, 1)))
  const legacySixStep = !project.planningData?.formVersion
  const currentStep = Math.min(5, legacySixStep ? (rawStep >= 6 ? 5 : rawStep >= 4 ? rawStep - 1 : rawStep) : rawStep)
  return {
    ...project,
    id: cleanText(id || project.id || project.projectId),
    projectId: cleanText(project.projectId || id),
    projectName: getProjectDisplayName({ ...project, planningData }),
    ownerName: cleanText(project.ownerName, '이름 미입력'),
    ownerEmail: cleanText(project.ownerEmail),
    teamName: cleanText(project.teamName, '팀명 미입력'),
    members: cleanList(project.members),
    oneLineSummary: cleanText(project.oneLineSummary, '작성된 소개가 없습니다.'),
    expectedDuration: cleanText(project.expectedDuration),
    status: normalizeProjectStatus(project.status),
    currentStep,
    progress: Math.min(100, Math.max(0, Math.round(currentStep / 5 * 100))),
    planningData,
    aiInteraction,
    teacherReview,
    reviewHistory: Array.isArray(project.reviewHistory) ? project.reviewHistory : [],
    processLog: { ...empty.processLog, ...(project.processLog ?? {}) },
    createdAt: toDate(project.createdAt),
    updatedAt: toDate(project.updatedAt) ?? toDate(project.createdAt),
    submittedAt: toDate(project.submittedAt),
  }
}
