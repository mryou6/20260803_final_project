import { normalizeProjectStatus, PROJECT_STATUS_LABELS } from '../constants/projectStatus.js'
import { cleanText, toDate } from './dataNormalizer.js'

const draftState = (draft = {}) => draft.formData?.projectState ?? {}

export function normalizeTeacherDataRows(drafts = [], projects = []) {
  const draftRows = drafts.map((draft) => {
    const state = draftState(draft)
    const basic = state.basic ?? draft.formData?.basicInfo ?? {}
    const currentStep = Math.max(1, Math.min(5, Number(draft.currentStep ?? state.currentStep) || 1))
    return {
      source: 'drafts', sourceLabel: '임시저장', documentId: draft.id,
      studentName: cleanText(basic.authorName || draft.ownerName, '이름 미입력'),
      studentEmail: cleanText(draft.ownerEmail),
      title: cleanText(basic.projectName || draft.title || draft.projectTitle, '제목 없는 프로젝트'),
      status: 'draft', statusLabel: PROJECT_STATUS_LABELS.draft,
      currentStep, progress: Math.round(currentStep / 5 * 100),
      updatedAt: toDate(draft.updatedAt || draft.lastSavedAt || state.savedAt),
      submittedAt: null, approvedAt: null,
    }
  })
  const projectRows = projects.map((project) => {
    const status = normalizeProjectStatus(project)
    return {
      source: 'projects', sourceLabel: '제출', documentId: project.id,
      studentName: cleanText(project.ownerName, '이름 미입력'),
      studentEmail: cleanText(project.ownerEmail),
      title: cleanText(project.projectName, '제목 없는 프로젝트'),
      status, statusLabel: PROJECT_STATUS_LABELS[status] ?? '상태 확인 필요',
      currentStep: Math.max(1, Math.min(5, Number(project.currentStep) || 1)),
      progress: Math.min(100, Math.max(0, Number(project.progress) || 0)),
      updatedAt: toDate(project.updatedAt), submittedAt: toDate(project.submittedAt), approvedAt: toDate(project.approvedAt),
    }
  })
  return [...draftRows, ...projectRows]
}

const time = (value) => value?.getTime?.() ?? 0
export function filterTeacherDataRows(rows, filters = {}) {
  const student = cleanText(filters.studentSearch).toLocaleLowerCase('ko')
  const title = cleanText(filters.titleSearch).toLocaleLowerCase('ko')
  return rows.filter((row) =>
    (!student || `${row.studentName} ${row.studentEmail}`.toLocaleLowerCase('ko').includes(student))
    && (!title || row.title.toLocaleLowerCase('ko').includes(title))
    && (!filters.status || filters.status === 'all' || row.status === filters.status)
    && (!filters.source || filters.source === 'all' || row.source === filters.source)
  ).sort((a, b) => {
    if (filters.sort === 'submitted') return time(b.submittedAt) - time(a.submittedAt)
    if (filters.sort === 'student') return a.studentName.localeCompare(b.studentName, 'ko')
    if (filters.sort === 'title') return a.title.localeCompare(b.title, 'ko')
    return time(b.updatedAt) - time(a.updatedAt)
  })
}

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
export function createTeacherDataCsv(rows, formatDate) {
  const headers = ['구분', '학생 이름', '학생 이메일', '프로젝트 제목', '상태', '현재 단계', '진행률', '마지막 저장일', '제출일', '승인일', '문서 ID']
  const body = rows.map((row) => [row.sourceLabel, row.studentName, row.studentEmail, row.title, row.statusLabel,
    row.currentStep, `${row.progress}%`, formatDate(row.updatedAt), formatDate(row.submittedAt), formatDate(row.approvedAt), row.documentId])
  return `\uFEFF${[headers, ...body].map((line) => line.map(csvCell).join(',')).join('\r\n')}`
}
