import { deduplicateDrafts, getProjectTitle, getSavedTime, normalizeProjectStatus, PROJECT_STATUS_LABELS } from '../constants/projectStatus.js'
import { cleanText, toDate } from './dataNormalizer.js'

const draftState = (draft = {}) => draft.formData?.projectState ?? {}

export function normalizeCurrentStep(value) {
  const step = Number(value)
  return Number.isFinite(step) ? Math.min(5, Math.max(1, Math.round(step))) : 1
}

export function parseGradeClass(label = '') {
  const gradeMatch = String(label).match(/(\d+)\s*학년/)
  const classMatch = String(label).match(/(\d+)\s*반/)
  return { grade: Number(gradeMatch?.[1] || 999), classNumber: Number(classMatch?.[1] || 999) }
}

export function sortGradeClasses(a, b) {
  const parsedA = parseGradeClass(a)
  const parsedB = parseGradeClass(b)
  return parsedA.grade - parsedB.grade || parsedA.classNumber - parsedB.classNumber
}

const tableDebugRow = (item) => ({
  sourceCollection: item.sourceCollection, documentId: item.id, projectId: item.projectId ?? '',
  legacyProjectId: item.legacyProjectId ?? '', ownerId: item.ownerId ?? '', title: getProjectTitle(item),
  currentStep: item.currentStep, progress: item.progress, updatedAt: item.updatedAt ?? '',
  lastSavedAt: item.lastSavedAt ?? '', status: item.status,
})

export function normalizeAndDeduplicateProjects(drafts = [], projects = []) {
  const draftDocuments = drafts.map((draft) => {
    const state = draftState(draft)
    const basic = state.basic ?? draft.formData?.basicInfo ?? {}
    const currentStep = normalizeCurrentStep(draft.currentStep ?? state.currentStep)
    const grade = cleanText(basic.grade)
    const className = cleanText(basic.className)
    return {
      ...draft, id: draft.id, sourceCollection: 'drafts', draftSource: 'drafts', status: 'draft',
      projectName: cleanText(basic.projectName || draft.title || draft.projectTitle, '제목 없는 프로젝트'),
      ownerName: cleanText(basic.authorName || draft.ownerName, '이름 미입력'), ownerEmail: cleanText(draft.ownerEmail),
      teamName: cleanText(basic.teamName, '팀명 미입력'), members: (basic.members ?? []).map((member) => cleanText(member?.name ?? member)).filter(Boolean),
      oneLineSummary: cleanText(basic.summary, '작성된 소개가 없습니다.'), grade, className,
      classroomKey: grade || className ? `${grade}|${className}` : '', board: cleanText(state.hardware?.board),
      currentStep, progress: currentStep * 20, updatedAt: toDate(draft.updatedAt || draft.lastSavedAt || state.savedAt),
      lastSavedAt: toDate(draft.lastSavedAt || state.savedAt), submittedAt: null, approvedAt: null,
      aiCallCount: Number(state.aiInteraction?.callCount) || 0, planningData: state, teacherReview: {}, reviewHistory: [],
    }
  })
  const projectDocuments = projects.map((project) => {
    const status = normalizeProjectStatus(project)
    const currentStep = normalizeCurrentStep(project.currentStep)
    return { ...project, sourceCollection: 'projects', draftSource: status === 'draft' ? 'legacy-project' : undefined,
      status, currentStep, progress: currentStep * 20 }
  })
  const legacyDrafts = projectDocuments.filter((project) => project.status === 'draft')
  const rawDrafts = [...draftDocuments, ...legacyDrafts]
  console.table(rawDrafts.map(tableDebugRow))
  const deduplicatedDrafts = deduplicateDrafts(rawDrafts).map((item) => ({
    ...item, status: 'draft', currentStep: normalizeCurrentStep(item.currentStep),
    progress: normalizeCurrentStep(item.currentStep) * 20,
  }))
  console.table(deduplicatedDrafts.map((item) => ({
    대표sourceCollection: item.sourceCollection, 대표documentId: item.id, title: getProjectTitle(item),
    currentStep: item.currentStep, progress: item.progress, savedTime: getSavedTime(item),
    mergedSourceCount: item.linkedDraftSources?.length ?? 1,
  })))
  return [...deduplicatedDrafts, ...projectDocuments.filter((project) => project.status !== 'draft')]
}

export function normalizeTeacherDataRows(items = []) {
  return items.map((project) => {
    const status = normalizeProjectStatus(project)
    return {
      source: project.sourceCollection, sourceLabel: project.sourceCollection === 'drafts' ? '임시저장' : status === 'draft' ? '임시저장' : '제출', documentId: project.id,
      studentName: cleanText(project.ownerName, '이름 미입력'),
      studentEmail: cleanText(project.ownerEmail),
      title: cleanText(project.projectName, '제목 없는 프로젝트'),
      status, statusLabel: PROJECT_STATUS_LABELS[status] ?? '상태 확인 필요',
      currentStep: normalizeCurrentStep(project.currentStep), progress: normalizeCurrentStep(project.currentStep) * 20,
      updatedAt: toDate(project.updatedAt), submittedAt: toDate(project.submittedAt), approvedAt: toDate(project.approvedAt),
    }
  })
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
