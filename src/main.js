// 전체 프로젝트 상태를 관리하고 단계별 화면과 사용자 상호작용을 연결합니다.
import './style.css'
import { createApiConnectionGate } from './components/apiConnectionGate.js'
import { createHeader } from './components/header.js'
import { createStepNavigation } from './components/stepNavigation.js'
import { createProjectForm } from './components/projectForm.js'
import { createPartsSelector } from './components/partsSelector.js'
import { createPlanPreview } from './components/planPreview.js'
import { createAiFeedback, createNotice } from './components/aiFeedback.js'
import { createTeacherFeedbackCard } from './components/teacherFeedbackCard.js'
import { createEmptyProject } from './data/projectSchema.js'
import { boards } from './data/boards.js'
import { parts } from './data/parts.js'
import { planSections } from './data/planSections.js'
import { createId, escapeHtml } from './utils/helpers.js'
import { PROJECT_STATUS_LABELS, classifyStudentDashboardProjects, isEditableProjectStatus, normalizeProjectStatus, supplementDraftData } from './constants/projectStatus.js'
import { validateStep } from './utils/validation.js'
import { syncRoleAssignmentsWithTeamMembers as syncRoleAssignmentsState } from './utils/teamRoles.js'
import { checkOpenAiConnection, reviewHardware, reviewPlanning } from './services/openaiService.js'
import { downloadProjectPlanAsDocx } from './services/documentService.js'
import { isFirebaseReady } from './firebase/firebaseConfig.js'
import {
  canStartProject,
  canEnterProtectedPage,
  createInitialConnectionState,
  updateAuthState,
  updateServiceConnection,
} from './utils/connectionState.js'
import { observeAuthState, signInWithGoogle, signOutUser } from './firebase/auth.js'
import { resolveUserRole, saveOrUpdateUser } from './firebase/userService.js'
import { getUserRole } from './firebase/roleService.js'
import {
  deleteDraftProject,
  getMyProjects,
  getProjectById,
  submitProject,
  markTeacherFeedbackAsRead,
} from './firebase/projectService.js'
import { deleteDraft, getMyDrafts, loadDraft, saveDraft } from './firebase/draftService.js'
import { validateSubmissionData } from './utils/projectValidation.js'
import {
  createEditorProjectState,
  fromProjectDocument,
  timestampToIso,
  toProjectDocument,
} from './utils/projectMapper.js'
import {
  endStepTimer,
  recordAiRequest,
  recordEdit,
  recordStepVisit,
  setFinalProjectIdea,
  setFirstProjectIdea,
  startSession,
  startStepTimer,
  getProcessLog,
  recordSavedAt,
  restoreProcessLog,
} from './utils/processLogger.js'

const createInitialState = () => createEditorProjectState()

export let projectState = createInitialState()

const isStudentPage = document.body.dataset.page === 'student'
let appView = isStudentPage ? 'project' : 'connection'
let connectionState = createInitialConnectionState()
let openAiRequestId = 0
let studentUser = null
let authUnsubscribe = null
let validationErrors = {}
let notice = ''
let myProjects = []
let myDrafts = []
let projectsLoading = false
let projectRouteMessage = ''
const PAGE_MODE = Object.freeze({ DASHBOARD: 'dashboard', CREATE: 'create', EDIT: 'edit', VIEW: 'view' })
let currentPageMode = PAGE_MODE.DASHBOARD
const createEditorState = (overrides = {}) => ({
  projectId: null,
  draftId: null,
  isSaving: false,
  isSubmitting: false,
  isDownloading: false,
  isReviewing: false,
  reviewType: '',
  reviewProgress: '',
  reviewErrors: {},
  aiSaveFailed: false,
  reviewCanRetry: false,
  lastSavedAt: null,
  status: 'draft',
  viewMode: false,
  ...overrides,
})
let editorState = createEditorState()
const savedUserIds = new Set()

const statusLabels = PROJECT_STATUS_LABELS
const isEditableStatus = isEditableProjectStatus
const isReadOnlyStatus = (status) => editorState.viewMode || !isEditableStatus(status)

function formatSavedTime(value) {
  const iso = timestampToIso(value)
  return iso ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso)) : '저장 기록 없음'
}

function renderStudentDashboard() {
  const {
    deduplicatedDrafts,
    submittedProjects,
    revisionProjects,
    approvedProjects,
    visibleSubmittedProjects,
  } = classifyStudentDashboardProjects(myDrafts, myProjects)
  const draftCards = deduplicatedDrafts.length ? deduplicatedDrafts.map((draft) => {
    const linkedSources = draft.linkedDraftSources ?? []
    const state = draft.formData?.projectState ?? {}
    const title = (state.basic?.projectName || draft.projectName || draft.title || draft.projectTitle)?.trim() || '제목 없는 프로젝트'
    const currentStep = Math.max(1, Number(draft.currentStep) || 1)
    const progress = Math.min(100, Math.round(currentStep / 5 * 100))
    return `<article class="my-project-card draft-project-card">
      <div class="project-card-heading"><span class="project-status status-draft">작성 중</span><small>${formatSavedTime(draft.displaySavedAt || draft.updatedAt || draft.lastSavedAt)}</small></div>
      <h3>${escapeHtml(title)}</h3>
      <div class="project-card-progress"><span style="width:${progress}%"></span></div>
      <div class="project-card-meta"><span>현재 ${currentStep}단계 · ${progress}%</span><span>마지막 저장 ${formatSavedTime(draft.displaySavedAt || draft.updatedAt || draft.lastSavedAt)}</span></div>
      <div class="project-card-actions">
        <button class="button button-primary" type="button" data-action="continue-merged-draft" data-draft-identity="${escapeHtml(draft.draftIdentity)}">이어서 작성</button>
        <button class="button project-delete-button" type="button" data-action="delete-draft-group" data-linked-sources="${escapeHtml(JSON.stringify(linkedSources))}">삭제</button>
      </div>
    </article>`
  }).join('') : '<p class="projects-empty">작성 중인 프로젝트가 없습니다.</p>'

  const projectCards = visibleSubmittedProjects.length ? visibleSubmittedProjects.map((project) => {
    const status = project.status
    const actionLabel = status === 'revision_requested' ? '수정하기' : '내용 보기'
    return `<article class="my-project-card submitted-project-card">
      <div class="project-card-heading"><span class="project-status status-${escapeHtml(status)}">${statusLabels[status] ?? '상태 확인 필요'}</span><small>${formatSavedTime(project.submittedAt || project.updatedAt)}</small></div>
      <h3>${escapeHtml(project.projectName || '제목 없는 프로젝트')}</h3>
      <p>${escapeHtml(project.teamName || '팀명 미입력')}</p>
      <div class="project-card-actions">
        <button class="button ${status === 'revision_requested' ? 'button-primary revision-action' : 'button-secondary'}" type="button" data-action="open-project" data-project-id="${project.id}">${actionLabel}</button>
        ${['submitted', 'resubmitted', 'approved'].includes(status) ? `<button class="button button-download" type="button" data-action="download-project-docx" data-project-id="${project.id}">Word 다운로드</button>` : ''}
      </div>
    </article>`
  }).join('') : '<p class="projects-empty">제출한 프로젝트가 없습니다.</p>'

  return `
    <section class="student-dashboard" aria-labelledby="my-projects-title">
      <div class="dashboard-heading"><div><p>STUDENT DASHBOARD</p><h1 id="my-projects-title">내 프로젝트</h1></div></div>
      <div class="project-status-summary" aria-label="프로젝트 상태 요약">
        <div><strong>${deduplicatedDrafts.length}</strong><span>작성 중</span></div><div><strong>${submittedProjects.length}</strong><span>검토 대기</span></div><div><strong>${revisionProjects.length}</strong><span>수정 요청</span></div><div><strong>${approvedProjects.length}</strong><span>승인 완료</span></div>
      </div>
      <button class="button button-primary dashboard-create-button" type="button" data-action="new-project">+ 새 프로젝트 만들기</button>
      ${projectRouteMessage ? createNotice(projectRouteMessage, 'info') : ''}
      ${projectsLoading ? '<p class="projects-empty">프로젝트 목록을 불러오고 있습니다.</p>' : `
        <section class="dashboard-project-group" aria-labelledby="draft-projects-title"><div class="project-group-heading"><h2 id="draft-projects-title">작성 중인 프로젝트</h2><span>${deduplicatedDrafts.length}개</span></div><div class="my-project-grid">${draftCards}</div></section>
        <section class="dashboard-project-group" aria-labelledby="submitted-projects-title"><div class="project-group-heading"><h2 id="submitted-projects-title">제출한 프로젝트</h2><span>${visibleSubmittedProjects.length}개</span></div><div class="my-project-grid">${projectCards}</div></section>
      `}
    </section>
  `
}

function setNestedValue(path, value) {
  const keys = path.split('.')
  const lastKey = keys.pop()
  const target = keys.reduce((object, key) => object[key], projectState)
  target[lastKey] = value
}

function clearFieldError(path, element) {
  delete validationErrors[path]
  const field = element.closest('.field')
  field?.querySelector(`[data-error-for="${path}"]`)?.replaceChildren()
  element.removeAttribute('aria-invalid')
}

function renderStepContent() {
  const step = projectState.currentStep
  if (step === 3) return `${createProjectForm(step, projectState, validationErrors)}${createPartsSelector(projectState, boards, parts, validationErrors)}`
  if (step === 5) return `${createAiFeedback(projectState, editorState)}${createPlanPreview(projectState)}`
  return createProjectForm(step, projectState, validationErrors)
}

function renderActions() {
  const step = projectState.currentStep

  if (editorState.viewMode) {
    return `<div class="view-mode-actions">
      <button class="button button-secondary" type="button" data-action="return-projects">내 프로젝트 목록으로 돌아가기</button>
      <button class="button button-download" type="button" data-action="download-docx">Word 기획안 다운로드</button>
    </div>`
  }

  if (step === 5) {
    const ai = projectState.aiInteraction ?? {}
    const reviewCard = (type, title, description) => {
      const isRunning = editorState.reviewType === type
      const isComplete = Boolean(ai[`${type}Review`]?.result)
      const hasError = Boolean(editorState.reviewErrors?.[type])
      const status = isRunning
        ? { className: 'is-running', role: 'status', text: 'AI가 기획안을 검토하고 있습니다.' }
        : hasError
          ? { className: 'is-error', role: 'alert', text: '검토를 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' }
          : isComplete
            ? { className: 'is-complete', role: 'status', text: '검토가 완료되었습니다.' }
            : { className: 'is-idle', role: 'status', text: '아직 검토하지 않았습니다.' }
      const actionLabel = type === 'planning' ? '기획 내용 검토 시작' : '하드웨어 검토 시작'
      return `<article class="ai-action-card" aria-labelledby="${type}-review-title" aria-describedby="${type}-review-description ${type}-review-status">
        <h4 id="${type}-review-title">${title}</h4>
        <p id="${type}-review-description">${description}</p>
        <span id="${type}-review-status" class="ai-action-status ${status.className}" role="${status.role}">${status.text}</span>
        <button class="button button-secondary" type="button" data-action="review-${type}" ${isRunning || editorState.isReviewing || isReadOnlyStatus(editorState.status) ? 'disabled' : ''} ${isRunning ? 'aria-busy="true"' : ''}>${isRunning ? '검토 중...' : actionLabel}</button>
      </article>`
    }
    return `
      <div class="preview-action-sections">
        <section class="preview-action-panel ai-action-panel" aria-labelledby="ai-action-panel-title">
          <div class="preview-action-heading"><h3 id="ai-action-panel-title">AI 기획안 검토</h3><p>작성한 기획 내용과 하드웨어 구성이 적절한지 AI의 검토 의견을 확인할 수 있습니다.</p></div>
          <div class="ai-action-grid">
            ${reviewCard('planning', '기획 내용 검토', '프로젝트 유형, 제작 목적, 핵심 기능, 작동 순서와 테스트 계획을 검토합니다.')}
            ${reviewCard('hardware', '하드웨어 검토', '사용 보드, 센서, 출력 장치, 전원, 핀 구성과 안전성을 검토합니다.')}
          </div>
        </section>
        <section class="preview-action-panel submission-action-panel" aria-labelledby="submission-action-title">
          <div class="preview-action-heading">
            <div><h3 id="submission-action-title">저장 및 제출</h3><p>작성 내용을 임시 저장하거나 Word 기획안으로 내려받고, 최종 확인 후 제출할 수 있습니다.</p></div>
            <span class="submission-save-status" role="status">${editorState.lastSavedAt ? `마지막 저장: ${formatSavedTime(editorState.lastSavedAt)}` : '아직 저장하지 않았습니다.'}</span>
          </div>
          <div class="submission-main-actions">
            <button class="button button-secondary" type="button" data-action="save-draft" ${editorState.isSaving || isReadOnlyStatus(editorState.status) ? 'disabled' : ''}>${editorState.isSaving ? '저장 중...' : '임시 저장'}</button>
            <button class="button button-download" type="button" data-action="download-docx" ${editorState.isDownloading ? 'disabled' : ''}>${editorState.isDownloading ? 'Word 문서 생성 중...' : 'Word 기획안 다운로드'}</button>
            <button class="button button-primary" type="button" data-action="submit-project" ${editorState.isSubmitting || isReadOnlyStatus(editorState.status) ? 'disabled' : ''}>${editorState.isSubmitting ? (editorState.status === 'revision_requested' ? '재제출 중...' : '제출 중...') : editorState.status === 'revision_requested' ? '수정 완료 및 재제출' : '최종 제출'}</button>
          </div>
          <p class="submission-note" role="note">최종 제출 후에는 교사의 수정 요청이 있기 전까지 기획안을 수정할 수 없습니다.</p>
          <div class="danger-action-area">
            <div><strong>전체 내용 초기화</strong><span>현재 작성 중인 모든 입력 내용을 삭제합니다.</span></div>
            <button class="button button-danger" type="button" data-action="reset">전체 내용 초기화</button>
          </div>
        </section>
      </div>
    `
  }

  return `
    <div class="form-actions">
      <button class="button button-secondary" type="button" data-action="previous" ${step === 1 ? 'disabled' : ''}>이전</button>
      <button class="button button-primary" type="button" data-action="next">다음 단계</button>
    </div>
  `
}

function render() {
  const app = document.querySelector('#app')
  if (!app) return

  syncRoleAssignmentsWithTeamMembers()

  if (appView === 'connection') {
    app.innerHTML = createApiConnectionGate(connectionState)
    return
  }

  const section = planSections[projectState.currentStep - 1]
  const isDashboard = currentPageMode === PAGE_MODE.DASHBOARD
  app.innerHTML = `
    <div class="app-shell">
      <div class="student-context-bar">
        <a href="/index.html" class="context-home">Arduino Project Studio AI</a>
        <div class="student-profile">
          ${studentUser?.photoURL
            ? `<img class="student-avatar-image" src="${escapeHtml(studentUser.photoURL)}" alt="${escapeHtml(studentUser.displayName || '사용자')} 프로필" referrerpolicy="no-referrer" />`
            : `<span class="student-avatar">${escapeHtml(studentUser?.displayName?.charAt(0) || '학')}</span>`}
          <div><strong>${escapeHtml(studentUser?.displayName || '학생 사용자')}</strong><span>${escapeHtml(studentUser?.email || '로그인 정보를 확인하고 있습니다.')}</span></div>
          <button class="student-logout-button" type="button" data-action="student-logout">로그아웃</button>
        </div>
      </div>
      ${isDashboard ? '' : createHeader(projectState.currentStep, planSections.length, section.title)}
      ${[PAGE_MODE.CREATE, PAGE_MODE.EDIT].includes(currentPageMode) ? createStepNavigation(planSections, projectState.currentStep, projectState.maxVisitedStep) : ''}
      <main id="student-main" class="workspace ${isDashboard ? 'student-dashboard-workspace' : 'student-editor-workspace'}">
        ${isDashboard ? renderStudentDashboard() : `
        <div class="editor-top-actions"><button class="button button-secondary" type="button" data-action="return-projects">← 내 프로젝트로 돌아가기</button></div>
        ${projectState.currentStep !== 5 && !editorState.viewMode ? `<div class="student-project-actions" aria-label="학생 프로젝트 관리">
          <button class="button button-secondary" type="button" data-action="save-draft" ${editorState.isSaving || isReadOnlyStatus(editorState.status) ? 'disabled' : ''}>${editorState.isSaving ? '저장 중...' : '임시 저장'}</button>
          <button class="button button-primary" type="button" data-action="submit-project" ${editorState.isSubmitting || isReadOnlyStatus(editorState.status) ? 'disabled' : ''}>${editorState.isSubmitting ? (editorState.status === 'revision_requested' ? '재제출 중...' : '제출 중...') : editorState.status === 'revision_requested' ? '수정 완료 및 재제출' : '최종 제출'}</button>
        </div>` : ''}
        ${projectState.currentStep !== 5 && editorState.lastSavedAt ? `<p class="editor-save-time">마지막 저장: ${formatSavedTime(editorState.lastSavedAt)}</p>` : ''}
        ${editorState.status === 'submitted' ? '<div class="submitted-notice">이 프로젝트는 제출되어 교사 검토를 기다리고 있습니다.</div>' : ''}
        ${editorState.status === 'resubmitted' ? '<div class="submitted-notice">수정한 기획안을 교사에게 다시 제출했습니다. 재검토를 기다리고 있습니다.</div>' : ''}
        ${editorState.status === 'approved' ? '<div class="submitted-notice">교사가 승인한 최종 기획안입니다. 내용은 수정할 수 없습니다.</div>' : ''}
        ${createTeacherFeedbackCard(projectState)}
        <section class="workspace-heading"><p>STEP ${String(projectState.currentStep).padStart(2, '0')}</p><h2>${section.title}</h2><span>${projectState.currentStep === 5 ? '작성한 내용을 확인하고 저장·검토·다운로드·제출할 수 있습니다.' : '항목을 차근차근 작성해 주세요. * 표시는 필수 항목입니다.'}</span></section>
        ${notice ? createNotice(notice, /저장되었습니다|제출되었습니다|불러왔습니다|삭제했습니다/.test(notice) ? 'success' : 'info') : ''}
        <div class="content-card">${renderStepContent()}</div>
        ${renderActions()}`}
      </main>
    </div>
  `

  const firstError = app.querySelector('.field-error')
  if (firstError) {
    firstError.closest('.field, fieldset')?.querySelector('input, select, textarea')?.setAttribute('aria-invalid', 'true')
  }
  if (isReadOnlyStatus(editorState.status)) {
    app.querySelectorAll('.project-form input, .project-form select, .project-form textarea, [data-action="add-member"], [data-action="remove-member"], [data-action="add-row"], [data-action="remove-row"], [data-action="toggle-core-value"], [data-action="toggle-part"], [data-action="add-custom-part"], [data-action="remove-part"], [data-action="reset"], [data-action="edit-step"]')
      .forEach((element) => { element.disabled = true })
  }
}

async function refreshMyProjects() {
  if (!studentUser?.uid) return
  projectsLoading = true
  render()
  if (import.meta.env.DEV && currentPageMode === PAGE_MODE.DASHBOARD) {
    console.debug('[학생 프로젝트 목록 렌더링]', {
      uid: studentUser?.uid,
      projectCount: myProjects?.length ?? 0,
      currentPageMode,
      sectionVisible: Boolean(document.querySelector('.student-dashboard')),
      currentUrl: window.location.href,
    })
  }
  const [projectResult, draftResult] = await Promise.all([
    getMyProjects(studentUser.uid),
    getMyDrafts(studentUser),
  ])
  projectsLoading = false
  if (projectResult.success) myProjects = projectResult.data
  else notice = projectResult.error
  if (draftResult.success) myDrafts = draftResult.data
  else notice = draftResult.error
  const { legacyDraftProjects } = classifyStudentDashboardProjects(myDrafts, myProjects)
  const babyDrafts = [
    ...myDrafts.map((item) => ({ ...item, collection: 'drafts' })),
    ...legacyDraftProjects.map((item) => ({ ...item, collection: 'projects' })),
  ].filter((item) => String(item.projectName || item.title || item.projectTitle || item.formData?.projectState?.basic?.projectName || '')
    .replace(/\s+/g, '') === '베이비육성프로젝트')
  if (babyDrafts.length) console.table(babyDrafts.map((item) => ({
    collection: item.collection,
    documentId: item.id,
    projectId: item.projectId ?? '',
    legacyProjectId: item.legacyProjectId ?? '',
    ownerId: item.ownerId ?? '',
    title: item.projectName || item.title || item.projectTitle || item.formData?.projectState?.basic?.projectName || '',
    currentStep: item.currentStep ?? '',
    updatedAt: item.updatedAt ?? '',
    lastSavedAt: item.lastSavedAt ?? '',
  })))
  if (legacyDraftProjects.length) {
    console.warn('[Legacy projects draft migration required]', legacyDraftProjects.map((project) => ({
      id: project.id,
      ownerId: project.ownerId,
      status: project.status,
    })))
  }
  render()
  if (window.location.hash === '#my-projects-title') {
    window.requestAnimationFrame(() => document.querySelector('#my-projects-title')?.scrollIntoView({ block: 'start' }))
  }
}

async function saveCurrentProject(successMessage = '프로젝트 기획안이 임시 저장되었습니다.') {
  if (!studentUser?.uid || editorState.isSaving || isReadOnlyStatus(editorState.status)) return false
  editorState.isSaving = true
  notice = ''
  render()
  recordSavedAt()
  const result = await saveDraft(studentUser, {
    draftId: editorState.draftId,
    projectId: editorState.projectId,
    currentStep: projectState.currentStep,
    formData: { projectState, processLog: getProcessLog() },
  })
  editorState.isSaving = false
  if (!result.success) {
    notice = result.error
    render()
    return false
  }
  editorState.draftId = result.draftId
  if (!editorState.projectId && currentPageMode === PAGE_MODE.CREATE) {
    currentPageMode = PAGE_MODE.EDIT
    window.history.replaceState({}, '', `/student.html?draftId=${encodeURIComponent(result.draftId)}&mode=edit`)
  }
  editorState.lastSavedAt = result.savedAt
  projectState.savedAt = editorState.lastSavedAt
  notice = successMessage
  render()
  return true
}

function restoreDraftData(draft) {
  if (!draft?.formData?.projectState) return false
  projectState = draft.formData.projectState
  syncRoleAssignmentsWithTeamMembers()
  restoreProcessLog(draft.formData.processLog)
  editorState = createEditorState({
    projectId: draft.projectId ?? projectState.projectId ?? null,
    draftId: draft.id,
    lastSavedAt: timestampToIso(draft.updatedAt),
    status: projectState.status ?? 'draft',
  })
  return true
}

async function openStudentProject(projectId, { mode, updateUrl = true } = {}) {
  if (!projectId) {
    projectRouteMessage = '기획안과 프로젝트 정보를 찾을 수 없습니다.'
    currentPageMode = PAGE_MODE.DASHBOARD
    render()
    return false
  }
  projectRouteMessage = '기획안을 불러오는 중입니다.'
  render()
  const result = await getProjectById(projectId, studentUser?.uid)
  if (!result.success) {
    projectRouteMessage = result.error || '기획안을 불러오지 못했습니다.'
    currentPageMode = PAGE_MODE.DASHBOARD
    render()
    return false
  }

  const status = normalizeProjectStatus(result.data.status)
  const viewMode = mode === 'view' || status !== 'revision_requested'
  currentPageMode = viewMode ? PAGE_MODE.VIEW : PAGE_MODE.EDIT
  projectState = fromProjectDocument(result.data)
  restoreProcessLog(result.data.processLog)
  editorState = createEditorState({
    projectId: result.data.id,
    lastSavedAt: timestampToIso(result.data.updatedAt),
    status,
    viewMode,
  })
  projectState.projectId = result.data.id
  projectState.status = status
  if (viewMode) {
    projectState.currentStep = 5
    projectState.maxVisitedStep = 5
  }
  projectRouteMessage = ''
  notice = status === 'approved'
    ? '승인 완료된 프로젝트입니다.'
    : status === 'submitted'
      ? '이 프로젝트는 교사 검토를 기다리고 있습니다.'
      : status === 'revision_requested'
        ? '교사 피드백을 확인하고 기획안을 수정해 주세요.'
        : '저장된 프로젝트를 불러왔습니다.'
  if (updateUrl) {
    const nextMode = viewMode ? 'view' : 'edit'
    window.history.pushState({}, '', `/student.html?projectId=${encodeURIComponent(result.data.id)}&mode=${nextMode}`)
  }
  render()

  if (!viewMode) {
    const draftResult = await loadDraft(studentUser, { projectId: result.data.id })
    if (draftResult.success && restoreDraftData(draftResult.data)) {
      editorState.projectId = result.data.id
      editorState.status = status
      notice = '임시저장한 작성 내용을 복구했습니다.'
      render()
    }
  }

  if (status === 'revision_requested' && !viewMode) {
    markTeacherFeedbackAsRead(result.data.id, studentUser).then((readResult) => {
      if (!readResult.success) return
      const readAt = readResult.readAt ?? new Date()
      projectState.teacherReview.notification = { ...projectState.teacherReview.notification, isRead: true, readAt, readBy: studentUser.uid }
      projectState.teacherReview.studentRead = true
      projectState.teacherReview.studentReadAt = readAt
      projectState.revisionInProgress = true
      render()
    })
  }
  window.scrollTo({ top: 0, behavior: 'smooth' })
  return true
}

async function showProjectList({ updateUrl = true } = {}) {
  currentPageMode = PAGE_MODE.DASHBOARD
  projectRouteMessage = ''
  notice = ''
  projectState = createInitialState()
  projectState.basic.authorName = studentUser?.displayName || ''
  projectState.currentStep = 1
  projectState.maxVisitedStep = 1
  editorState = createEditorState()
  validationErrors = {}

  if (updateUrl) {
    const url = new URL(window.location.href)
    ;['projectId', 'draftId', 'mode', 'step', 'view', 'preview'].forEach((key) => url.searchParams.delete(key))
    url.searchParams.delete('section')
    window.history.pushState({}, '', url)
  }
  await refreshMyProjects()
  window.requestAnimationFrame(() => {
    document.querySelector('#my-projects-title')?.scrollIntoView({ block: 'start' })
  })
}

function startNewProject({ updateUrl = true } = {}) {
  projectState = createInitialState()
  projectState.basic.authorName = studentUser?.displayName || ''
  editorState = createEditorState({ projectId: null, draftId: null, lastSavedAt: null, status: 'draft' })
  validationErrors = {}
  projectRouteMessage = ''
  notice = ''
  currentPageMode = PAGE_MODE.CREATE
  startSession()
  recordStepVisit(1)
  startStepTimer(1)
  if (updateUrl) window.history.pushState({}, '', '/student.html?mode=create')
  render()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

async function resolveStudentRoute() {
  if (!isStudentPage) return
  const params = new URLSearchParams(window.location.search)
  const projectId = params.get('projectId')
  const draftId = params.get('draftId')
  const mode = params.get('mode')
  if (projectId && (mode === 'view' || mode === 'edit')) {
    await openStudentProject(projectId, { mode, updateUrl: false })
    return
  }
  if (draftId && mode === 'edit') {
    const draftResult = await loadDraft(studentUser, { draftId })
    if (draftResult.success && restoreDraftData(draftResult.data)) {
      currentPageMode = PAGE_MODE.EDIT
      render()
      window.scrollTo({ top: 0 })
      return
    }
  }
  if (mode === 'create') {
    startNewProject({ updateUrl: false })
    return
  }
  await showProjectList({ updateUrl: false })
}

function ensureAiInteraction() {
  const empty = createEmptyProject().aiInteraction
  projectState.aiInteraction = {
    ...empty,
    ...(projectState.aiInteraction ?? {}),
    planningReview: { ...empty.planningReview, ...(projectState.aiInteraction?.planningReview ?? {}) },
    hardwareReview: { ...empty.hardwareReview, ...(projectState.aiInteraction?.hardwareReview ?? {}) },
  }
  return projectState.aiInteraction
}

function reviewMissingFields(projectDocument, reviewType) {
  const planning = projectDocument.planningData ?? {}
  if (reviewType === 'hardware') {
    const parts = Array.isArray(planning.parts) ? planning.parts : []
    return !planning.board || !parts.length || !planning.requiredFeatures?.length
      ? ['보드와 부품을 먼저 선택해 주세요.']
      : []
  }
  const fields = [
    [projectDocument.projectName, '프로젝트명'],
    [planning.projectType, '프로젝트 유형'],
    [planning.ideaDescription, '만들고 싶은 작품'],
    [planning.selectionReason, '주제 선정 이유'],
    [planning.targetUser, '대상 사용자'],
    [planning.requiredFeatures?.length, '핵심 기능'],
    [planning.operationSteps?.length, '전체 작동 순서'],
  ]
  return fields.filter(([value]) => !value).map(([, label]) => label)
}

async function requestAiReview(reviewType) {
  if (editorState.isReviewing || isReadOnlyStatus(editorState.status)) return
  if (!studentUser?.uid) {
    notice = 'AI 검토를 사용하려면 Google 로그인이 필요합니다.'
    render()
    return
  }
  const projectDocument = toProjectDocument(projectState, getProcessLog())
  const missing = reviewMissingFields(projectDocument, reviewType)
  if (missing.length) {
    notice = reviewType === 'hardware'
      ? '하드웨어 검토를 시작하려면 보드와 부품을 먼저 선택해 주세요.'
      : `기획 내용 검토를 시작하려면 다음 항목을 먼저 작성해 주세요: ${missing.join(', ')}`
    render()
    return
  }

  editorState.isReviewing = true
  editorState.reviewType = reviewType
  editorState.reviewErrors = { ...(editorState.reviewErrors ?? {}), [reviewType]: false }
  editorState.reviewCanRetry = false
  editorState.reviewProgress = reviewType === 'planning'
    ? '기획 내용을 검토하고 있습니다...'
    : '보드와 부품 구성을 검토하고 있습니다...'
  notice = ''
  render()

  const reviewFunction = reviewType === 'planning' ? reviewPlanning : reviewHardware
  const result = await reviewFunction(projectDocument, {
    onSlow: () => {
      if (!editorState.isReviewing) return
      editorState.reviewProgress = '검토에 시간이 조금 더 걸리고 있습니다.'
      render()
    },
  })
  editorState.isReviewing = false
  editorState.reviewType = ''
  editorState.reviewProgress = ''
  if (!result.success) {
    editorState.reviewErrors = { ...(editorState.reviewErrors ?? {}), [reviewType]: true }
    notice = result.error
    render()
    return
  }

  const reviewedAt = new Date().toISOString()
  editorState.reviewErrors = { ...(editorState.reviewErrors ?? {}), [reviewType]: false }
  editorState.reviewCanRetry = false
  const ai = ensureAiInteraction()
  const targetKey = reviewType === 'planning' ? 'planningReview' : 'hardwareReview'
  ai[targetKey] = {
    result: result.review,
    reviewedAt,
    callCount: (Number(ai[targetKey]?.callCount) || 0) + 1,
  }
  ai.callCount = (Number(ai.callCount) || 0) + 1
  ai.lastReviewedAt = reviewedAt
  recordAiRequest()
  render()

  const saved = await saveCurrentProject(`${reviewType === 'planning' ? '기획 내용' : '하드웨어'} 검토 결과가 프로젝트에 저장되었습니다.`)
  editorState.aiSaveFailed = !saved
  if (!saved) notice = 'AI 검토 결과는 화면에 유지되었지만 Firestore 저장에 실패했습니다.'
  render()
}

function categoryStep(category = '') {
  if (/문제|사용자|주제/.test(category)) return 2
  if (/기능|시나리오|성공/.test(category)) return 3
  if (/보드|부품|핀|전원|하드웨어/.test(category)) return 4
  if (/일정|역할|비용|안전|제작/.test(category)) return 5
  return 6
}

function hasUnacknowledgedDanger() {
  const ai = ensureAiInteraction()
  const acknowledged = new Set((ai.warningAcknowledgements ?? []).filter((item) => item.acknowledged).map((item) => item.warningId))
  return (ai.latestReview?.warnings ?? []).some((warning) => warning.severity === 'danger' && !acknowledged.has(warning.id))
}

function getNestedValue(path) {
  return path.split('.').reduce((value, key) => value?.[key], projectState)
}

function syncRoleAssignmentsWithTeamMembers() {
  projectState.production.memberRoles = syncRoleAssignmentsState(
    projectState.basic.members,
    projectState.production.memberRoles,
  )
}

function updatePartField(element) {
  const part = projectState.hardware.parts.find((item) => item.id === element.dataset.partId)
  if (!part) return

  const fieldName = element.dataset.partField
  part[fieldName] = fieldName === 'quantity' ? Math.max(1, Number(element.value)) : element.value
}

function handleInput(event) {
  const element = event.target
  recordEdit()

  if (element.name === 'memberName') {
    const member = projectState.basic.members.find((item) => item.id === element.dataset.id)
    if (member) member.name = element.value
    syncRoleAssignmentsWithTeamMembers()
    clearFieldError('basic.members', element)
    if (event.type === 'change') render()
    return
  }

  if (element.dataset.partField) {
    updatePartField(element)
    return
  }

  if (element.dataset.rowPath) {
    const target = getNestedValue(element.dataset.rowPath)?.find((item) => item.id === element.dataset.id)
    if (target) target[element.dataset.rowField] = element.value
    if (target && element.dataset.rowPath === 'production.memberRoles' && element.dataset.rowField === 'memberId') {
      const member = projectState.basic.members.find((item) => item.id === element.value)
      target.member = member?.name ?? ''
    }
    delete validationErrors[element.dataset.rowPath]
    return
  }

  if (element.name?.includes('.')) {
    const value = element.name === 'production.budget'
      ? element.value.replace(/[^\d]/g, '')
      : element.value
    setNestedValue(element.name, value)
    if (element.name === 'production.budget') {
      element.value = value ? Number(value).toLocaleString('ko-KR') : ''
    }
    if (element.name === 'basic.summary') {
      setFirstProjectIdea(element.value)
      setFinalProjectIdea(element.value)
    }
    clearFieldError(element.name, element)
    if (element.name === 'basic.projectType' || element.name === 'hardware.board') render()
  }
}

function goToStep(step) {
  endStepTimer(projectState.currentStep)
  projectState.currentStep = step
  projectState.maxVisitedStep = Math.max(projectState.maxVisitedStep, step)
  recordStepVisit(step)
  startStepTimer(step)
  if (step === 5) setFinalProjectIdea(projectState.basic.summary)
  validationErrors = {}
  notice = ''
  render()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function handleNext() {
  validationErrors = validateStep(projectState.currentStep, projectState)
  if (Object.keys(validationErrors).length) {
    notice = ''
    render()
    document.querySelector('.field-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return
  }
  goToStep(Math.min(5, projectState.currentStep + 1))
}

async function handleClick(event) {
  const button = event.target.closest('[data-action]')
  if (!button) return

  const { action } = button.dataset

  if (action === 'check-connection') {
    const requestId = ++openAiRequestId
    connectionState = updateServiceConnection(connectionState, 'openai', {
      status: 'loading',
      label: '연결 중',
      message: 'OpenAI API 연결 상태를 확인하고 있습니다.',
    })
    render()

    const result = await checkOpenAiConnection()
    if (requestId !== openAiRequestId) return

    connectionState = updateServiceConnection(
      connectionState,
      'openai',
      result.success
        ? {
          status: 'success',
          label: '연결 완료',
          message: 'OpenAI API 연결이 확인되었습니다.',
        }
        : {
          status: 'error',
          label: '연결 실패',
          message: 'OpenAI API 연결을 확인하지 못했습니다. 관리자에게 문의하거나 환경변수 설정을 확인해 주세요.',
        },
    )
    render()
    return
  }

  if (action === 'google-sign-in') {
    if (!canStartProject(connectionState) || connectionState.auth.status === 'signing-in') return

    connectionState = updateAuthState(connectionState, {
      status: 'signing-in',
      user: null,
      message: '',
    })
    render()
    const result = await signInWithGoogle()
    connectionState = updateAuthState(
      connectionState,
      result.success
        ? { status: 'signed-in', user: result.user, message: '' }
        : { status: 'error', user: null, message: result.error },
    )
    render()
    return
  }

  if (action === 'sign-out') {
    const result = await signOutUser()
    connectionState = updateAuthState(
      connectionState,
      result.success
        ? { status: 'signed-out', user: null, message: '' }
        : { status: 'error', message: result.error },
    )
    render()
    return
  }

  if (action === 'start-project' && canEnterProtectedPage(connectionState)) {
    if (connectionState.userRole?.role !== 'student') return
    window.location.href = '/student.html?mode=create'
    return
  }

  if (action === 'open-my-projects' && canEnterProtectedPage(connectionState)) {
    if (connectionState.userRole?.role !== 'student') return
    window.location.href = '/student.html'
    return
  }

  if (action === 'open-teacher' && canEnterProtectedPage(connectionState)) {
    if (connectionState.userRole?.role !== 'teacher') return
    window.location.href = '/teacher.html'
    return
  }

  if (action === 'open-submissions' && canEnterProtectedPage(connectionState)) {
    if (connectionState.userRole?.role !== 'teacher') return
    window.location.href = '/teacher.html?status=submitted#submission-status'
    return
  }

  if (action === 'next') handleNext()
  if (action === 'previous') goToStep(Math.max(1, projectState.currentStep - 1))
  if (action === 'go-step' || action === 'edit-step') goToStep(Number(button.dataset.step))

  if (action === 'add-member') {
    projectState.basic.members.push({ id: createId('member'), name: '' })
    syncRoleAssignmentsWithTeamMembers()
    render()
  }

  if (action === 'remove-member') {
    projectState.basic.members = projectState.basic.members.filter((member) => member.id !== button.dataset.id)
    syncRoleAssignmentsWithTeamMembers()
    render()
  }

  if (action === 'add-row') {
    const list = getNestedValue(button.dataset.path)
    const templates = {
      'production.memberRoles': { memberId: '', member: '', roleTypes: [], roleType: '', customRole: '' },
      'production.schedule': { period: '', goal: '' },
      'production.difficultyPlans': { difficulty: '', solution: '' },
      'production.testPlans': { feature: '', method: '', successCondition: '' },
    }
    list.push({ id: createId('row'), ...(templates[button.dataset.path] ?? { value: '' }) })
    render()
  }

  if (action === 'remove-row') {
    const path = button.dataset.path
    const list = getNestedValue(path)
    const filtered = list.filter((item) => item.id !== button.dataset.id)
    const keys = path.split('.')
    const target = keys.slice(0, -1).reduce((value, key) => value[key], projectState)
    target[keys.at(-1)] = filtered
    render()
  }

  if (action === 'toggle-core-value') {
    projectState.intent.coreValues = button.checked
      ? [...new Set([...projectState.intent.coreValues, button.value])]
      : projectState.intent.coreValues.filter((value) => value !== button.value)
    render()
  }

  if (action === 'toggle-team-role') {
    const role = projectState.production.memberRoles.find((item) => item.id === button.dataset.id)
    if (!role) return
    const selected = Array.isArray(role.roleTypes) ? role.roleTypes : role.roleType ? [role.roleType] : []
    role.roleTypes = button.checked
      ? [...new Set([...selected, button.value])]
      : selected.filter((type) => type !== button.value)
    role.roleType = role.roleTypes[0] ?? ''
    delete validationErrors['production.memberRoles']
    render()
  }

  if (action === 'toggle-part') {
    const list = projectState.hardware.parts
    const isCustomOption = button.value === '기타 직접 입력'
    if (button.checked) {
      const saved = list.find((part) => part.category === button.dataset.category
        && (isCustomOption ? part.isCustom : part.name === button.value && !part.isCustom)
        && part.isActive === false)
      if (saved) saved.isActive = true
      else list.push({ id: createId('part'), category: button.dataset.category, name: isCustomOption ? '' : button.value, quantity: 1, role: '', availability: 'check', isCustom: isCustomOption, isActive: true })
    } else {
      if (isCustomOption) {
        list.filter((part) => part.category === button.dataset.category && part.isCustom).forEach((part) => { part.isActive = false })
      } else {
        projectState.hardware.parts = list.filter((part) => !(part.category === button.dataset.category && part.name === button.value && !part.isCustom))
      }
    }
    delete validationErrors['hardware.parts']
    render()
  }

  if (action === 'add-custom-part') {
    projectState.hardware.parts.push({ id: createId('part'), category: 'other', name: '', quantity: 1, role: '', availability: 'check', isCustom: true, isActive: true })
    render()
  }

  if (action === 'remove-part') {
    projectState.hardware.parts = projectState.hardware.parts.filter((part) => part.id !== button.dataset.id)
    render()
  }

  if (action === 'save-draft') {
    await saveCurrentProject()
    return
  }

  if (action === 'new-project') {
    startNewProject()
    return
  }

  if (action === 'continue-draft') {
    const result = await loadDraft(studentUser, { draftId: button.dataset.draftId })
    if (!result.success || !restoreDraftData(result.data)) {
      projectRouteMessage = result.error || '임시저장 내용을 불러오지 못했습니다.'
      render()
      return
    }
    currentPageMode = PAGE_MODE.EDIT
    window.history.pushState({}, '', `/student.html?draftId=${encodeURIComponent(result.data.id)}&mode=edit`)
    notice = '임시저장한 작성 내용을 복구했습니다.'
    render()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  if (action === 'continue-legacy-draft') {
    const legacyProject = myProjects.find((project) => project.id === button.dataset.projectId)
    if (!legacyProject || normalizeProjectStatus(legacyProject) !== 'draft') return
    console.log('[Legacy draft migration target]', {
      id: legacyProject.id,
      title: legacyProject.projectName || '제목 없는 프로젝트',
    })
    const restoredState = fromProjectDocument(legacyProject)
    restoredState.projectId = null
    restoredState.status = 'draft'
    const processLog = legacyProject.processLog ?? {}
    const migrated = await saveDraft(studentUser, {
      draftId: null,
      projectId: null,
      legacyProjectId: legacyProject.id,
      legacyCreatedAt: legacyProject.createdAt ?? null,
      legacyUpdatedAt: legacyProject.updatedAt ?? null,
      currentStep: legacyProject.currentStep ?? restoredState.currentStep,
      formData: { projectState: restoredState, processLog },
    })
    if (!migrated.success) {
      projectRouteMessage = migrated.error || '구버전 작성 내용을 안전하게 이전하지 못했습니다. 기존 프로젝트는 유지됩니다.'
      render()
      return
    }
    restoreDraftData({
      id: migrated.draftId,
      projectId: null,
      legacyProjectId: legacyProject.id,
      currentStep: restoredState.currentStep,
      formData: { projectState: restoredState, processLog },
      updatedAt: migrated.savedAt,
    })
    currentPageMode = PAGE_MODE.EDIT
    window.history.pushState({}, '', `/student.html?draftId=${encodeURIComponent(migrated.draftId)}&mode=edit`)
    notice = '기존 작성 내용을 임시저장 문서로 안전하게 이전했습니다.'
    render()
    window.scrollTo({ top: 0, behavior: 'smooth' })

    console.log('[Legacy draft source retained after migration]', { collection: 'projects', documentId: legacyProject.id })
    return
  }

  if (action === 'continue-merged-draft') {
    const { deduplicatedDrafts } = classifyStudentDashboardProjects(myDrafts, myProjects)
    const selected = deduplicatedDrafts.find((draft) => draft.draftIdentity === button.dataset.draftIdentity)
    if (!selected) return
    if (selected.draftSource === 'legacy-project') {
      const existingDraftSource = selected.linkedDraftSources?.find((source) => source.collection === 'drafts')
      const restoredState = supplementDraftData(fromProjectDocument(selected), selected.formData?.projectState || {})
      restoredState.projectId = null
      restoredState.status = 'draft'
      const processLog = selected.formData?.processLog ?? selected.processLog ?? {}
      console.log('[Legacy draft migration target]', { collection: 'projects', documentId: selected.id, title: selected.projectName })
      const migrated = await saveDraft(studentUser, {
        draftId: existingDraftSource?.documentId ?? null,
        projectId: null,
        legacyProjectId: selected.id,
        legacyCreatedAt: selected.createdAt ?? null,
        legacyUpdatedAt: selected.updatedAt ?? null,
        currentStep: selected.currentStep ?? restoredState.currentStep,
        formData: { projectState: restoredState, processLog },
      })
      if (!migrated.success) {
        projectRouteMessage = migrated.error || '구버전 작성 내용을 안전하게 이전하지 못했습니다. 기존 문서는 유지됩니다.'
        render()
        return
      }
      restoreDraftData({
        id: migrated.draftId,
        projectId: null,
        legacyProjectId: selected.id,
        currentStep: restoredState.currentStep,
        formData: { projectState: restoredState, processLog },
        updatedAt: migrated.savedAt,
      })
      currentPageMode = PAGE_MODE.EDIT
      window.history.pushState({}, '', `/student.html?draftId=${encodeURIComponent(migrated.draftId)}&mode=edit`)
      notice = '기존 작성 내용을 임시저장 문서로 안전하게 이전했습니다.'
      console.log('[Legacy draft source retained after migration]', { collection: 'projects', documentId: selected.id })
      render()
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }
    if (!restoreDraftData(selected)) {
      projectRouteMessage = '임시저장 내용을 불러오지 못했습니다.'
      render()
      return
    }
    currentPageMode = PAGE_MODE.EDIT
    window.history.pushState({}, '', `/student.html?draftId=${encodeURIComponent(selected.id)}&mode=edit`)
    notice = '임시저장한 작성 내용을 복구했습니다.'
    render()
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }

  if (action === 'delete-draft-group') {
    let sources = []
    try { sources = JSON.parse(button.dataset.linkedSources || '[]') } catch { sources = [] }
    const message = sources.length > 1
      ? '연결된 작성 중 데이터가 함께 삭제됩니다. 삭제할까요? 삭제한 내용은 복구할 수 없습니다.'
      : '작성 중인 프로젝트를 삭제할까요? 삭제한 내용은 복구할 수 없습니다.'
    if (!window.confirm(message)) return
    console.log('[Draft delete targets]')
    console.table(sources)
    const results = []
    for (const source of sources) {
      results.push(source.collection === 'projects'
        ? await deleteDraftProject(source.documentId, studentUser)
        : await deleteDraft(source.documentId, studentUser))
    }
    const failed = results.find((result) => !result.success)
    projectRouteMessage = failed ? failed.error : '작성 중인 프로젝트를 삭제했습니다.'
    await refreshMyProjects()
    return
  }

  if (action === 'delete-draft') {
    if (!window.confirm('작성 중인 프로젝트를 삭제할까요? 삭제한 내용은 복구할 수 없습니다.')) return
    const result = await deleteDraft(button.dataset.draftId, studentUser)
    projectRouteMessage = result.success ? '작성 중인 프로젝트를 삭제했습니다.' : result.error
    await refreshMyProjects()
    return
  }

  if (action === 'delete-legacy-draft') {
    const legacyProject = myProjects.find((project) => project.id === button.dataset.projectId)
    if (!legacyProject || normalizeProjectStatus(legacyProject) !== 'draft') return
    if (!window.confirm('기존 작성 중 프로젝트를 삭제할까요? 삭제한 내용은 복구할 수 없습니다.')) return
    console.log('[Legacy draft delete target]', {
      id: legacyProject.id,
      title: legacyProject.projectName || '제목 없는 프로젝트',
    })
    const result = await deleteDraftProject(legacyProject.id, studentUser)
    projectRouteMessage = result.success ? '작성 중인 프로젝트를 삭제했습니다.' : result.error
    await refreshMyProjects()
    return
  }

  if (action === 'open-project') {
    const listed = myProjects.find((project) => project.id === button.dataset.projectId)
    const mode = normalizeProjectStatus(listed?.status) === 'revision_requested' ? 'edit' : 'view'
    await openStudentProject(button.dataset.projectId, { mode })
    return
  }

  if (action === 'return-projects') {
    await showProjectList()
    return
  }

  if (action === 'download-project-docx') {
    const result = await getProjectById(button.dataset.projectId, studentUser?.uid)
    if (!result.success) {
      notice = result.error
      render()
      return
    }
    const documentState = fromProjectDocument(result.data)
    const download = await downloadProjectPlanAsDocx({
      ...documentState,
      status: result.data.status,
      createdAt: result.data.createdAt,
      updatedAt: result.data.updatedAt,
      processLog: result.data.processLog,
      teacherReview: result.data.teacherReview,
      reviewHistory: result.data.reviewHistory,
      approvedAt: result.data.approvedAt,
      approvedBy: result.data.approvedBy,
      approvedByName: result.data.approvedByName,
    }, studentUser)
    notice = download.success ? '프로젝트 기획안 Word 문서를 다운로드했습니다.' : download.error
    render()
    return
  }

  if (action === 'delete-project') {
    if (!window.confirm('작성 중인 프로젝트를 삭제할까요? 삭제한 내용은 복구할 수 없습니다.')) return
    const result = await deleteDraftProject(button.dataset.projectId, studentUser)
    notice = result.success ? '작성 중인 프로젝트를 삭제했습니다.' : result.error
    if (result.success && editorState.projectId === button.dataset.projectId) {
      projectState = createInitialState()
      projectState.basic.authorName = studentUser?.displayName || ''
      editorState = createEditorState()
      startSession()
    }
    await refreshMyProjects()
    return
  }

  if (action === 'submit-project') {
    if (editorState.isSubmitting || isReadOnlyStatus(editorState.status)) return
    if (hasUnacknowledgedDanger()) {
      notice = '중요한 기술·안전 경고를 먼저 확인해 주세요.'
      projectState.currentStep = 6
      render()
      return
    }
    const missing = validateSubmissionData(toProjectDocument(projectState, getProcessLog()))
    if (missing.length) {
      notice = `최종 제출 전 다음 항목을 작성해 주세요: ${missing.join(', ')}`
      render()
      return
    }
    const returning = editorState.status === 'revision_requested'
    if (returning) {
      const reviewedAt = projectState.teacherReview?.reviewedAt
      const reviewedIso = timestampToIso(reviewedAt)
      const savedIso = timestampToIso(getProcessLog().lastSavedAt)
      if (reviewedIso && (!savedIso || new Date(savedIso) <= new Date(reviewedIso))) {
        if (!window.confirm('교사 피드백 이후 수정된 내용이 확인되지 않습니다.\n그래도 다시 제출하시겠습니까?')) return
      } else if (!window.confirm('교사 피드백을 반영한 수정안을 다시 제출하시겠습니까?')) return
    } else if (!window.confirm('최종 제출 후에는 교사 검토 전까지 수정할 수 없습니다. 제출하시겠습니까?')) return
    editorState.isSubmitting = true
    render()
    if (!(await saveCurrentProject())) {
      editorState.isSubmitting = false
      render()
      return
    }
    const result = await submitProject(
      editorState.projectId,
      studentUser,
      toProjectDocument(projectState, getProcessLog()),
      editorState.draftId,
    )
    editorState.isSubmitting = false
    if (!result.success) {
      notice = result.error
      render()
      return
    }
    editorState.projectId = result.projectId
    editorState.draftId = null
    projectState.projectId = result.projectId
    editorState.status = result.wasReturned ? 'resubmitted' : 'submitted'
    projectState.status = editorState.status
    projectState.currentStep = 6
    projectState.maxVisitedStep = 6
    notice = result.message
    await refreshMyProjects()
    return
  }

  if (action === 'future') {
    notice = '추후 구현 예정입니다.'
    render()
  }

  if (action === 'download-docx') {
    if (editorState.isDownloading) return
    editorState.isDownloading = true
    notice = ''
    render()
    const result = await downloadProjectPlanAsDocx(
      {
        ...projectState,
        status: editorState.status,
        updatedAt: editorState.lastSavedAt,
        processLog: getProcessLog(),
        teacherReview: projectState.teacherReview,
        reviewHistory: projectState.reviewHistory,
      },
      studentUser,
    )
    editorState.isDownloading = false
    notice = result.success
      ? '프로젝트 기획안 Word 문서를 다운로드했습니다.'
      : result.error || 'Word 문서를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.'
    render()
    return
  }

  if (action === 'review-planning') {
    await requestAiReview('planning')
    return
  }

  if (action === 'review-hardware') {
    await requestAiReview('hardware')
    return
  }

  if (action === 'retry-ai-save') {
    const saved = await saveCurrentProject('AI 검토 결과가 프로젝트에 저장되었습니다.')
    editorState.aiSaveFailed = !saved
    render()
    return
  }

  if (action === 'save-ai-answer') {
    if (isReadOnlyStatus(editorState.status)) return
    const ai = ensureAiInteraction()
    const question = ai.latestReview?.followUpQuestions?.find((item) => item.id === button.dataset.questionId)
    const answer = document.querySelector(`[data-ai-answer="${CSS.escape(button.dataset.questionId)}"]`)?.value.trim() ?? ''
    if (!answer) {
      notice = '추가 질문에 대한 답변을 작성해 주세요.'
      render()
      return
    }
    ai.studentAnswers = (ai.studentAnswers ?? []).filter((item) => item.questionId !== button.dataset.questionId)
    ai.studentAnswers.push({ questionId: button.dataset.questionId, question: question?.question ?? '', answer, answeredAt: new Date().toISOString() })
    await saveCurrentProject('학생 답변을 기획안 기록에 저장했습니다. 관련 단계에서 내용을 직접 수정해 주세요.')
    return
  }

  if (action === 'go-ai-step') {
    goToStep(categoryStep(button.dataset.category))
    return
  }

  if (action === 'ack-warning') {
    if (isReadOnlyStatus(editorState.status)) return
    const ai = ensureAiInteraction()
    ai.warningAcknowledgements = (ai.warningAcknowledgements ?? []).filter((item) => item.warningId !== button.dataset.warningId)
    if (button.checked) ai.warningAcknowledgements.push({ warningId: button.dataset.warningId, acknowledged: true, acknowledgedAt: new Date().toISOString() })
    await saveCurrentProject('경고 확인 기록을 저장했습니다.')
    return
  }

  if (action === 'decide-suggestion') {
    if (isReadOnlyStatus(editorState.status)) return
    const ai = ensureAiInteraction()
    const suggestion = ai.latestReview?.suggestions?.find((item) => item.id === button.dataset.suggestionId)
    const reason = document.querySelector(`[data-suggestion-reason="${CSS.escape(button.dataset.suggestionId)}"]`)?.value.trim() ?? ''
    if (button.dataset.decision !== 'accepted' && !reason) {
      notice = '일부 반영 또는 반영하지 않음을 선택할 때는 이유를 작성해 주세요.'
      render()
      return
    }
    const record = { suggestionId: button.dataset.suggestionId, title: suggestion?.title ?? '', decision: button.dataset.decision, reason, decidedAt: new Date().toISOString() }
    ai.reflectedSuggestions = (ai.reflectedSuggestions ?? []).filter((item) => item.suggestionId !== record.suggestionId)
    ai.partiallyReflectedSuggestions = (ai.partiallyReflectedSuggestions ?? []).filter((item) => item.suggestionId !== record.suggestionId)
    ai.rejectedSuggestions = (ai.rejectedSuggestions ?? []).filter((item) => item.suggestionId !== record.suggestionId)
    const target = button.dataset.decision === 'accepted' ? ai.reflectedSuggestions : button.dataset.decision === 'partial' ? ai.partiallyReflectedSuggestions : ai.rejectedSuggestions
    target.push(record)
    ai.rejectionReasons = ai.rejectedSuggestions.map((item) => item.reason).filter(Boolean)
    await saveCurrentProject('AI 제안에 대한 학생의 판단을 저장했습니다.')
    return
  }

  if (action === 'reset' && window.confirm('작성한 모든 내용을 초기화할까요?')) {
    projectState = createInitialState()
    projectState.basic.authorName = studentUser?.displayName || ''
    editorState = createEditorState()
    validationErrors = {}
    notice = '기획안 입력 내용을 모두 초기화했습니다.'
    render()
  }
}

export function initializeApp(user = null) {
  studentUser = user
  if (!projectState.basic.authorName) projectState.basic.authorName = user?.displayName || ''
  if (isStudentPage) {
    startSession()
    recordStepVisit(projectState.currentStep)
    startStepTimer(projectState.currentStep)
  }
  document.addEventListener('input', handleInput)
  document.addEventListener('change', handleInput)
  document.addEventListener('click', handleClick)
  document.addEventListener('keydown', (event) => {
    const card = event.target.closest('.my-project-card[data-action="open-project"]')
    if (card && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      card.click()
    }
  })
  window.addEventListener('popstate', resolveStudentRoute)
  render()

  if (!isStudentPage) {
    authUnsubscribe?.()
    authUnsubscribe = observeAuthState((userState) => {
      connectionState = updateAuthState(connectionState, {
        status: userState ? 'signed-in' : 'signed-out',
        user: userState,
        message: '',
      })
      connectionState = {
        ...connectionState,
        userRole: userState
          ? { status: 'checking', role: null, message: '사용자 권한을 확인하고 있습니다.' }
          : { status: 'idle', role: null, message: '' },
      }
      render()
      if (userState?.uid) {
        const profileReady = savedUserIds.has(userState.uid)
          ? Promise.resolve()
          : saveOrUpdateUser(userState)
        savedUserIds.add(userState.uid)
        profileReady
          .then(() => resolveUserRole(userState))
          .then(() => getUserRole(userState))
          .then((result) => {
            if (connectionState.auth.user?.uid !== userState.uid) return
            connectionState = {
              ...connectionState,
              userRole: result.success
                ? { status: 'ready', role: result.role === 'teacher' ? 'teacher' : 'student', message: '' }
                : { status: 'error', role: null, message: result.message },
            }
            render()
          })
      }
    })

    queueMicrotask(() => {
      const ready = isFirebaseReady()
      connectionState = updateServiceConnection(connectionState, 'firebase', {
        status: ready ? 'success' : 'error',
        label: ready ? '연결 완료' : '연결 실패',
        message: ready
          ? 'Firebase SDK 초기화가 완료되었습니다.'
          : 'Firebase 설정을 확인하지 못했습니다. 환경변수 설정을 확인해 주세요.',
      })
      render()
    })
  } else {
    resolveStudentRoute()
  }
}

if (!isStudentPage) initializeApp()
