import './teacher.css'
import { escapeHtml } from './utils/helpers.js'
import { observeAuthState, signOutUser } from './firebase/auth.js'
import { isCurrentUserTeacher } from './firebase/roleService.js'
import { deleteProjectsForTeacher, getAllDraftsForTeacher, getAllProjectsForTeacher, getProjectDetailForTeacher, getTeacherDashboardStats, subscribeAllDraftsForTeacher, subscribeAllProjectsForTeacher } from './firebase/teacherProjectService.js'
import { fromProjectDocument } from './utils/projectMapper.js'
import { downloadProjectPlanAsDocx } from './services/documentService.js'
import { createTeacherReviewPanel, readTeacherReviewForm } from './components/teacherReviewPanel.js'
import { approveProject, requestRevision, reviewChecklistLabels } from './firebase/teacherReviewService.js'
import { createDeleteProjectsModal, trapDeleteModalFocus } from './components/deleteProjectsModal.js'
import { PROJECT_STATUS_LABELS, STATUS_CARD_FILTERS } from './constants/projectStatus.js'
import { formatCurrency, formatDateTime } from './utils/dataNormalizer.js'
import { normalizeProjectForOutput } from './utils/projectOutput.js'
import { createProjectSelection, createTeacherDataCsv, filterTeacherDataRows, normalizeAndDeduplicateProjects, normalizeTeacherDataRows, projectSelectionKey, sortGradeClasses, toggleVisibleProjectSelections } from './utils/teacherProjectTable.js'

const requestedStatus = new URLSearchParams(location.search).get('status')
const filters = {
  className: 'all',
  status: ['draft', 'submitted', 'revision_requested', 'resubmitted', 'approved'].includes(requestedStatus) ? requestedStatus : 'all',
  step: 'all', board: 'all', notification: 'all', search: '', sort: 'newest',
}
const dataTableFilters = { studentSearch: '', titleSearch: '', status: 'all', source: 'all', sort: 'saved' }
const statusLabels = PROJECT_STATUS_LABELS
const safe = (value, fallback = '') => {
  if (value === undefined || value === null || typeof value === 'object') return fallback
  const result = String(value).trim()
  return result && !['undefined', 'null', '[object Object]'].includes(result) ? result : fallback
}
const array = (value) => Array.isArray(value) ? value : []
const shown = (value) => escapeHtml(safe(value, '작성된 내용이 없습니다.'))
const formatDate = (value) => formatDateTime(value)
const debounce = (callback, delay = 180) => {
  let timer
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => callback(...args), delay) }
}

let currentTeacher
let projects = []
let drafts = []
let projectDocuments = []
let initialized = false
let permissionPending = false
let lastDetailTrigger
let openDetailProjectId = null
let deleteModalTrigger = null
let dashboardNotice = null
let projectsUnsubscribe = null
let draftsUnsubscribe = null
const selectedProjects = new Map()

const unique = (key) => [...new Set(projects.map((project) => safe(project[key])).filter(Boolean))]
const options = (items, label) => `<option value="all">${label}</option>${items.map((item) => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('')}`
const classroomOptions = () => `<option value="all">전체 학급</option>${unique('classroomKey').sort((a, b) => {
  const [gradeA, classA] = a.split('|')
  const [gradeB, classB] = b.split('|')
  return sortGradeClasses(`${gradeA}학년 ${classA}반`, `${gradeB}학년 ${classB}반`)
}).map((key) => {
  const [grade, className] = key.split('|')
  const label = [grade && `${grade}학년`, className && `${className}반`].filter(Boolean).join(' ')
  return `<option value="${escapeHtml(key)}">${escapeHtml(label)}</option>`
}).join('')}`
const searchText = (project) => [
  project.projectName, project.teamName, project.ownerName, project.ownerEmail, project.oneLineSummary, ...project.members,
].map((value) => safe(value).toLocaleLowerCase('ko')).join(' ')

function visibleProjects() {
  const keyword = filters.search.trim().toLocaleLowerCase('ko')
  return projects.filter((project) =>
    (!keyword || searchText(project).includes(keyword)) &&
    (filters.className === 'all' || project.classroomKey === filters.className) &&
    (filters.status === 'all' || project.status === filters.status) &&
    (filters.step === 'all' || String(project.currentStep) === filters.step) &&
    (filters.board === 'all' || project.board === filters.board) &&
    (filters.notification === 'all' ||
      (filters.notification === 'unread' && project.status === 'revision_requested' && project.teacherReview?.studentRead !== true) ||
      (filters.notification === 'read' && project.status === 'revision_requested' && project.teacherReview?.studentRead === true) ||
      (filters.notification === 'none' && project.status !== 'revision_requested'))
  ).sort((a, b) => {
    if (filters.sort === 'oldest') return (a.updatedAt?.getTime() ?? 0) - (b.updatedAt?.getTime() ?? 0)
    if (filters.sort === 'progress-desc') return b.progress - a.progress
    if (filters.sort === 'progress-asc') return a.progress - b.progress
    if (filters.sort === 'name') return a.projectName.localeCompare(b.projectName, 'ko')
    if (filters.sort === 'status') return a.status.localeCompare(b.status)
    return (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0)
  })
}

function rows(items) {
  if (!items.length) return `<tr><td class="teacher-empty" colspan="11">현재 조건에 해당하는 프로젝트가 없습니다.${filters.status !== 'all' ? '<button class="button button-secondary" type="button" data-action="reset-status-filter">상태 필터 초기화</button>' : ''}</td></tr>`
  return items.map((project) => {
    const className = [project.grade && `${project.grade}학년`, project.className && `${project.className}반`].filter(Boolean).join(' ') || '-'
    const people = project.teamName !== '팀명 미입력'
      ? `<strong>${escapeHtml(project.teamName)}</strong><span>${escapeHtml(project.members.join(', ') || project.ownerName || '-')}</span>`
      : `<strong>${escapeHtml(project.ownerName || project.members.join(', ') || '-')}</strong><span>${escapeHtml(project.ownerEmail || '-')}</span>`
    const notification = project.status === 'revision_requested'
      ? `<strong>${project.teacherReview?.studentRead === true ? '학생 확인 완료' : '읽지 않음'}</strong><span>요청 ${formatDate(project.teacherReview?.requestedAt || project.teacherReview?.reviewedAt)}</span>${project.teacherReview?.studentRead === true ? `<span>확인 ${formatDate(project.teacherReview?.studentReadAt)}</span>` : ''}`
      : ['submitted', 'resubmitted'].includes(project.status)
        ? (project.status === 'resubmitted'
            ? `<strong>학생 수정 완료</strong><span>재제출 ${formatDate(project.resubmittedAt)}</span><span>피드백 확인 ${formatDate(project.teacherReview?.studentReadAt)}</span>`
            : '검토 전')
        : project.status === 'approved' ? '승인 완료' : '-'
    const selectionKey = projectSelectionKey(project)
    return `<tr class="project-row" tabindex="0" data-project-id="${escapeHtml(project.id)}" data-source="${project.sourceCollection}" aria-label="${escapeHtml(project.projectName)} 상세 보기">
      <td><input type="checkbox" data-select-project data-selection-key="${escapeHtml(selectionKey)}" data-source-collection="${project.sourceCollection}" data-document-id="${escapeHtml(project.id)}" aria-label="${escapeHtml(project.projectName)} 프로젝트 선택" ${selectedProjects.has(selectionKey) ? 'checked' : ''}></td>
      <td>${escapeHtml(className)}</td><td>${people}</td>
      <td><strong>${escapeHtml(project.projectName)}</strong><span>${escapeHtml(project.oneLineSummary)}</span><span>${escapeHtml(project.board || '보드 미입력')}</span></td>
      <td><span class="step-chip">${project.currentStep}단계</span></td>
      <td><div class="table-progress"><span style="width:${project.progress}%"></span></div><small>${project.progress}%</small></td>
      <td>${project.aiCallCount}회</td><td><span class="teacher-status status-${project.status}">${statusLabels[project.status]}</span></td>
      <td>${notification}</td><td>${formatDate(project.updatedAt)}</td><td><button type="button" class="row-view-button" ${project.status === 'draft' ? `data-action="view-data-row" data-source="${project.sourceCollection}" data-document-id="${escapeHtml(project.id)}"` : `data-project-id="${escapeHtml(project.id)}"`}>보기</button></td>
    </tr>`
  }).join('')
}

function syncStatusControls() {
  const statusSelect = document.querySelector('[data-filter="status"]')
  if (statusSelect) statusSelect.value = filters.status
  document.querySelectorAll('[data-status-card]').forEach((card) => {
    const selected = card.dataset.statusCard === filters.status
    card.classList.toggle('is-active', selected)
    card.setAttribute('aria-pressed', String(selected))
  })
}

function updateStatusUrl() {
  const url = new URL(location.href)
  if (filters.status === 'all') url.searchParams.delete('status')
  else url.searchParams.set('status', filters.status)
  history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`)
}

function setStatusFilter(status) {
  filters.status = ['all', 'draft', 'submitted', 'revision_requested', 'resubmitted', 'approved'].includes(status) ? status : 'all'
  updateStatusUrl()
  syncStatusControls()
  renderResults()
}

function renderResults() {
  const items = visibleProjects()
  const meta = document.querySelector('.result-meta')
  const body = document.querySelector('tbody')
  const unreadVisible = items.filter((project) => project.status === 'revision_requested' && project.teacherReview?.studentRead !== true).length
  if (meta) {
    const filterLabel = filters.status === 'all' ? '프로젝트' : `${statusLabels[filters.status] ?? '선택 상태'} 프로젝트`
    meta.innerHTML = `전체 ${projects.length}개 중 <strong>${items.length}개</strong>의 ${filterLabel}를 표시하고 있습니다. <span>읽지 않은 수정 요청 ${unreadVisible}개</span>`
  }
  if (body) body.innerHTML = rows(items)
  const selectAll = document.querySelector('[data-select-all]')
  if (selectAll) {
    const selectedVisible = items.filter((project) => selectedProjects.has(projectSelectionKey(project))).length
    selectAll.checked = items.length > 0 && selectedVisible === items.length
    selectAll.indeterminate = selectedVisible > 0 && selectedVisible < items.length
  }
  const selectedCount = document.querySelector('[data-selected-count]')
  if (selectedCount) selectedCount.textContent = `${selectedProjects.size}개 프로젝트 선택됨`
  const deleteButton = document.querySelector('[data-action="open-project-delete"]')
  if (deleteButton) deleteButton.disabled = selectedProjects.size === 0
  syncStatusControls()
}

const allProjectDataRows = () => normalizeTeacherDataRows(projects)
const visibleProjectDataRows = () => filterTeacherDataRows(allProjectDataRows(), dataTableFilters)

function dataTableRows(items) {
  if (!items.length) return '<tr><td class="teacher-empty" colspan="12">현재 조건에 해당하는 데이터가 없습니다.</td></tr>'
  return items.map((item) => `<tr>
    <td>${item.sourceLabel}</td><td>${escapeHtml(item.studentName)}</td><td>${escapeHtml(item.studentEmail || '-')}</td>
    <td><strong>${escapeHtml(item.title)}</strong></td><td><span class="teacher-status status-${escapeHtml(item.status)}">${escapeHtml(item.statusLabel)}</span></td>
    <td>${item.currentStep}단계</td><td>${item.progress}%</td><td>${formatDate(item.updatedAt)}</td>
    <td>${formatDate(item.submittedAt)}</td><td>${formatDate(item.approvedAt)}</td><td><code>${escapeHtml(item.documentId)}</code></td>
    <td><button class="row-view-button" type="button" data-action="view-data-row" data-source="${item.source}" data-document-id="${escapeHtml(item.documentId)}">상세 보기</button></td>
  </tr>`).join('')
}

function renderProjectDataResults() {
  const items = visibleProjectDataRows()
  const root = document.querySelector('[data-project-data-table]')
  if (!root) return
  root.querySelector('tbody').innerHTML = dataTableRows(items)
  root.querySelector('[data-project-data-meta]').textContent = `전체 ${allProjectDataRows().length}개 중 ${items.length}개 표시`
  const count = (status) => items.filter((item) => item.status === status).length
  root.querySelector('[data-project-data-stats]').innerHTML = [
    ['전체', items.length], ['작성 중', count('draft')], ['검토 대기', count('submitted')],
    ['수정 요청', count('revision_requested')], ['승인 완료', count('approved')],
  ].map(([label, value]) => `<div><span>${label}</span><strong>${value}</strong></div>`).join('')
}

function renderDashboard() {
  const stats = getTeacherDashboardStats(projects)
  document.querySelector('#teacher-app').innerHTML = `<div class="teacher-shell">
    <header class="teacher-header"><a href="/index.html" class="teacher-brand"><span class="teacher-logo">A</span><span><strong>Arduino Project Studio AI</strong><small>Teacher Dashboard</small></span></a>
      <div class="teacher-user"><span>${escapeHtml(currentTeacher?.displayName?.charAt(0) || '교')}</span><div><strong>${escapeHtml(currentTeacher?.displayName || '교사')}</strong><small>${escapeHtml(currentTeacher?.email || '')}</small></div><button class="teacher-logout-button" type="button" data-action="teacher-logout">로그아웃</button></div></header>
    <main class="teacher-main"><section class="teacher-title"><div><p>PROJECT MONITORING</p><h1>학생 프로젝트 모니터링</h1><span>Firestore에 저장된 기획 진행 상황과 AI 활용 과정을 확인하세요.</span></div><button class="refresh-button" type="button" data-action="refresh">새로고침</button></section>
      ${dashboardNotice ? `<div class="teacher-toast toast-${dashboardNotice.type}" role="${dashboardNotice.type === 'error' ? 'alert' : 'status'}">${escapeHtml(dashboardNotice.message)}</div>` : ''}
      <section class="summary-cards" aria-label="프로젝트 요약">
        ${STATUS_CARD_FILTERS.map(({ key, label }) => {
          const count = key === 'all' ? stats.total : key === 'submitted' ? stats.submitted : key === 'revision_requested' ? stats.returned : stats.approved
          const detail = key === 'all'
            ? `작성 중 ${stats.draft} · 재검토 대기 ${projects.filter((project) => project.status === 'resubmitted').length}`
            : key === 'submitted' ? `최근 7일 제출 ${stats.recentSubmissionCount}건`
              : key === 'revision_requested' ? `미확인 ${stats.unreadFeedbackCount} · 확인 ${stats.readFeedbackCount}`
                : '승인된 프로젝트'
          return `<button class="summary-card summary-card-filter" type="button" ${key === 'submitted' ? 'id="submission-status"' : ''} data-action="filter-status-card" data-status-card="${key}" aria-pressed="${filters.status === key}">
            <span>${label}</span><strong>${count}</strong><small>${detail}</small>
          </button>`
        }).join('')}
        <article class="summary-card summary-card-static"><span>AI 호출</span><strong>${stats.aiCallCount}</strong><small>총 요청 횟수</small></article>
      </section>
      <section class="teacher-content" id="project-monitoring"><div class="filter-bar">
        <label class="teacher-search"><span class="sr-only">통합 검색</span><input type="search" data-filter="search" value="${escapeHtml(filters.search)}" placeholder="프로젝트명, 팀명, 학생 이름·이메일, 소개 검색" /></label>
        <select data-filter="className" aria-label="학급 필터">${classroomOptions()}</select>
        <select data-filter="status" aria-label="제출 상태 필터"><option value="all">전체 상태</option>${Object.entries(statusLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}</select>
        <select data-filter="step" aria-label="현재 단계 필터"><option value="all">전체 단계</option>${[1,2,3,4,5].map((step) => `<option value="${step}">${step}단계</option>`).join('')}</select>
        <select data-filter="board" aria-label="사용 보드 필터">${options(unique('board'), '전체 보드')}</select>
        <select data-filter="notification" aria-label="알림 상태 필터"><option value="all">전체 알림 상태</option><option value="unread">읽지 않음</option><option value="read">읽음</option><option value="none">알림 없음</option></select>
        <select data-filter="sort" aria-label="정렬"><option value="newest">최근 저장순</option><option value="oldest">오래된 저장순</option><option value="progress-desc">진행률 높은순</option><option value="progress-asc">진행률 낮은순</option><option value="name">프로젝트명 가나다순</option><option value="status">제출 상태순</option></select>
      </div><div class="selection-toolbar"><label><input type="checkbox" data-select-all aria-label="현재 표시된 프로젝트 전체 선택"> 현재 결과 전체 선택</label><span data-selected-count>0개 프로젝트 선택됨</span><button class="button button-danger" type="button" data-action="open-project-delete" disabled>선택 삭제</button></div>
      <div class="result-meta"></div><div class="table-wrap"><table><thead><tr><th><span class="sr-only">선택</span></th><th>학년·반</th><th>학생 또는 팀</th><th>프로젝트명 / 소개 / 보드</th><th>현재 단계</th><th>진행률</th><th>AI 호출</th><th>제출 상태</th><th>피드백 확인</th><th>최종 저장</th><th>보기</th></tr></thead><tbody></tbody></table></div></section>
      <section class="teacher-content project-data-section" data-project-data-table><div class="project-data-heading"><div><p>FIRESTORE DATA</p><h2>전체 프로젝트 데이터</h2><span>drafts와 projects 컬렉션을 읽기 전용 표로 확인합니다.</span></div><button class="button button-primary" type="button" data-action="download-project-data-csv">CSV 다운로드</button></div>
        <div class="project-data-stats" data-project-data-stats></div>
        <div class="project-data-filters"><input type="search" data-data-filter="studentSearch" placeholder="학생 이름 또는 이메일 검색"><input type="search" data-data-filter="titleSearch" placeholder="프로젝트 제목 검색"><select data-data-filter="status"><option value="all">전체 상태</option><option value="draft">작성 중</option><option value="submitted">검토 대기</option><option value="revision_requested">수정 요청</option><option value="approved">승인 완료</option></select><select data-data-filter="source"><option value="all">전체 컬렉션</option><option value="drafts">drafts · 임시저장</option><option value="projects">projects · 제출</option></select><select data-data-filter="sort"><option value="saved">최근 저장순</option><option value="submitted">최근 제출순</option><option value="student">학생 이름순</option><option value="title">프로젝트 제목순</option></select></div>
        <div class="result-meta" data-project-data-meta></div><div class="table-wrap project-data-table-wrap"><table><thead><tr><th>구분</th><th>학생 이름</th><th>학생 이메일</th><th>프로젝트 제목</th><th>상태</th><th>현재 단계</th><th>진행률</th><th>마지막 저장일</th><th>제출일</th><th>승인일</th><th>문서 ID</th><th>상세 보기</th></tr></thead><tbody></tbody></table></div>
      </section>
    </main></div>`
  Object.entries(filters).forEach(([key, value]) => { const control = document.querySelector(`[data-filter="${key}"]`); if (control) control.value = value })
  Object.entries(dataTableFilters).forEach(([key, value]) => { const control = document.querySelector(`[data-data-filter="${key}"]`); if (control) control.value = value })
  renderResults()
  renderProjectDataResults()
}

function renderState(message, action = '', spinner = true) {
  document.querySelector('#teacher-app').innerHTML = `<main class="teacher-auth-loading" role="status">${spinner ? '<span class="teacher-loading-spinner" aria-hidden="true"></span>' : ''}<p>${escapeHtml(message)}</p>${action}</main>`
}

async function loadProjects({ keepDashboard = false } = {}) {
  const button = document.querySelector('[data-action="refresh"]')
  if (button) { button.disabled = true; button.textContent = '불러오는 중...' }
  if (!keepDashboard) renderState('학생 프로젝트를 불러오고 있습니다.')
  const [result, draftResult] = await Promise.all([getAllProjectsForTeacher(), getAllDraftsForTeacher()])
  if (!result.success) {
    renderState(result.error, '<button class="button button-primary" type="button" data-action="retry-projects">다시 시도</button>', false)
    return
  }
  projectDocuments = result.projects
  drafts = draftResult.success ? draftResult.drafts : []
  projects = normalizeAndDeduplicateProjects(drafts, projectDocuments)
  if (!draftResult.success) dashboardNotice = { type: 'error', message: draftResult.error }
  renderDashboard()
  if (!projectsUnsubscribe) {
    projectsUnsubscribe = subscribeAllProjectsForTeacher(
      (nextProjects) => {
        projectDocuments = nextProjects
        projects = normalizeAndDeduplicateProjects(drafts, projectDocuments)
        renderDashboard()
        if (openDetailProjectId) void openDetails(openDetailProjectId, null)
      },
      (error) => {
        dashboardNotice = { type: 'error', message: error.error }
        renderDashboard()
      },
    )
  }
  if (!draftsUnsubscribe) {
    draftsUnsubscribe = subscribeAllDraftsForTeacher(
      (nextDrafts) => { drafts = nextDrafts; projects = normalizeAndDeduplicateProjects(drafts, projectDocuments); renderDashboard() },
      (error) => { dashboardNotice = { type: 'error', message: error.error }; renderDashboard() },
    )
  }
  if (location.hash === '#submission-status') requestAnimationFrame(() => document.querySelector('#submission-status')?.scrollIntoView({ block: 'center' }))
}

const field = (label, value) => `<div><dt>${label}</dt><dd>${shown(value)}</dd></div>`
const section = (title, fields) => `<section><h3>${title}</h3><dl class="detail-grid">${fields.join('')}</dl></section>`
const listText = (value) => array(value).map((item) => safe(item?.name ?? item)).filter(Boolean).join(', ')

async function openDetails(projectId, trigger) {
  openDetailProjectId = projectId
  lastDetailTrigger = trigger
  const root = document.querySelector('#detail-root')
  root.innerHTML = '<div class="detail-backdrop"><aside class="detail-panel detail-loading" role="dialog" aria-modal="true"><span class="teacher-loading-spinner"></span><p>프로젝트 상세 정보를 불러오고 있습니다.</p></aside></div>'
  document.body.classList.add('detail-open')
  const result = await getProjectDetailForTeacher(projectId, currentTeacher)
  if (!result.success) {
    root.innerHTML = `<div class="detail-backdrop" data-action="close-detail"><aside class="detail-panel detail-loading" role="alert"><p>${escapeHtml(result.error)}</p><button class="button button-primary" data-project-id="${escapeHtml(projectId)}">다시 시도</button><button class="button" data-action="close-detail">닫기</button></aside></div>`
    return
  }
  const project = result.project
  const p = project.planningData
  const output = normalizeProjectForOutput(project)
  const ai = project.aiInteraction
  const log = project.processLog
  const review = ai.latestReview && typeof ai.latestReview === 'object' ? ai.latestReview : {}
  root.innerHTML = `<div class="detail-backdrop" data-action="close-detail"><aside class="detail-panel" role="dialog" aria-modal="true" aria-labelledby="detail-title">
    <div class="detail-header"><div><p>${escapeHtml(safe(project.grade, '-'))}학년 · ${escapeHtml(safe(project.className, '-'))}반</p><h2 id="detail-title">${shown(project.projectName)}</h2><span>${shown(project.teamName)} / ${shown(project.members.join(', ') || project.ownerName)}</span></div><button type="button" class="detail-close" data-action="close-detail" aria-label="상세 패널 닫기">×</button></div>
    <div class="detail-actions"><button class="button button-primary" type="button" data-action="download-docx" data-project-id="${escapeHtml(project.id)}">Word 기획안 다운로드</button><span class="detail-operation-message" role="status" aria-live="polite"></span></div>
    <div class="detail-body">
      ${section('1. 프로젝트 기본 정보', [field('학년·반', `${safe(project.grade, '-')}학년 ${safe(project.className, '-')}반`), field('팀명', project.teamName), field('학생 또는 팀원', project.members.join(', ') || project.ownerName), field('프로젝트명', project.projectName), field('한 줄 소개', project.oneLineSummary), field('프로젝트 유형', p.projectType), field('예상 제작 기간', project.expectedDuration), field('상태', statusLabels[project.status]), field('최근 저장일', formatDate(project.updatedAt)), field('제출일', formatDate(project.submittedAt))])}
      ${section('2. 아이디어와 제작 목적', [field('만들고 싶은 작품', p.ideaDescription), field('주제 선정 이유', p.selectionReason), field('대상 사용자', p.targetUser), field('핵심 가치', listText(p.coreValues)), field('참고 작품', p.referenceProject), field('차별점', p.differentiation)])}
      ${section('3. 기능 및 하드웨어 설계', [field('핵심 기능', output.requiredFeatures.join('\n')), field('추가 기능', output.optionalFeatures.join('\n')),field('전체 작동 순서',output.operationSteps.map((item,index) => `${index+1}. ${item}`).join('\n')),field('사용 보드', output.board), field('선택 부품', output.parts.map((part) => `${part.name} · ${part.quantity}개 · ${part.role} · ${{owned:'보유',purchase:'구매 필요',check:'확인 필요'}[part.availability] || '-'}`).join('\n')),field('핀·전원 주의사항',output.pinConditions)])}
      ${section('4. 제작 계획 및 테스트', [field('역할 분담', output.memberRoles.map((item) => `${item.memberName} · ${item.role}`).join('\n')), field('제작 일정', output.schedule.map((item) => `${item.period} · ${item.goal}`).join('\n')), field('어려움과 해결 계획',output.difficultyPlans.map((item) => `${item.difficulty} · ${item.solution}`).join('\n')),field('안전 및 준비 사항',output.safetyAndPreparation),field('예상 제작 비용',String(output.estimatedCost ?? '').trim() ? formatCurrency(output.estimatedCost) : ''),field('기능 테스트 계획',output.testPlans.map((item) => `${item.feature} · ${item.method} · ${item.successCondition}`).join('\n'))])}
      ${section('5. AI 검토 기록', [field('AI 호출 횟수', `${project.aiCallCount}회`), field('최근 AI 검토 결과', review.summary), field('추가 질문', listText(review.followUpQuestions ?? ai.followUpQuestions)), field('학생 답변', array(ai.studentAnswers).map((item) => safe(item?.answer ?? item)).join(', ')), field('경고', array(review.warnings ?? ai.warnings).map((item) => safe(item?.title ?? item)).join(', ')), field('반영한 제안', array(ai.reflectedSuggestions).map((item) => safe(item?.title ?? item)).join(', ')), field('반영하지 않은 제안', array(ai.rejectedSuggestions).map((item) => safe(item?.title ?? item)).join(', '))])}
      ${section('과정 기록', [field('최초 아이디어', log.firstProjectIdea), field('최종 아이디어', log.finalProjectIdea), field('현재 단계', `${project.currentStep}단계`), field('방문 단계', array(log.visitedSteps).map((step) => `${step}단계`).join(', ')), field('수정 횟수', `${Number(log.editCount) || 0}회`), field('단계별 작성 시간', Object.entries(log.stepDurations ?? {}).map(([step, ms]) => `${step}단계 ${Math.round((Number(ms) || 0) / 60000)}분`).join(', '))])}
      ${createTeacherReviewPanel(project)}
    </div></aside></div>`
  root.querySelector('.detail-close')?.focus()
  syncReviewSelectAll(root.querySelector('.teacher-review-panel'))
}

function closeDetails() {
  document.querySelector('#detail-root').replaceChildren()
  document.body.classList.remove('detail-open')
  openDetailProjectId = null
  lastDetailTrigger?.focus()
}

const updateSearch = debounce((value) => { filters.search = value; renderResults() })
function toggleSelectAllVisibleProjects(checked) {
  toggleVisibleProjectSelections(selectedProjects, visibleProjects(), checked)
}
function syncReviewSelectAll(panel) {
  const selectAll = panel?.querySelector('[data-review-select-all]')
  const items = [...(panel?.querySelectorAll('.review-checklist input[name]') ?? [])]
  if (!selectAll || !items.length) return
  const checkedCount = items.filter((item) => item.checked).length
  selectAll.checked = checkedCount === items.length
  selectAll.indeterminate = checkedCount > 0 && checkedCount < items.length
  selectAll.nextElementSibling.textContent = selectAll.checked ? '전체 해제' : '전체 선택'
}
document.addEventListener('input', (event) => {
  if (event.target.matches('[data-delete-confirm]')) {
    const confirmButton = document.querySelector('[data-action="confirm-project-delete"]')
    if (confirmButton) confirmButton.disabled = event.target.value !== '삭제'
    return
  }
  if (event.target.dataset.filter === 'search') updateSearch(event.target.value)
  const dataFilter = event.target.dataset.dataFilter
  if (dataFilter && ['studentSearch', 'titleSearch'].includes(dataFilter)) {
    dataTableFilters[dataFilter] = event.target.value
    renderProjectDataResults()
  }
})
document.addEventListener('change', (event) => {
  if (event.target.matches('[data-review-select-all]')) {
    const panel = event.target.closest('.teacher-review-panel')
    panel?.querySelectorAll('.review-checklist input[name]').forEach((item) => { item.checked = event.target.checked })
    syncReviewSelectAll(panel)
    return
  }
  if (event.target.matches('.review-checklist input[name]')) {
    syncReviewSelectAll(event.target.closest('.teacher-review-panel'))
    return
  }
  if (event.target.matches('[data-select-all]')) {
    toggleSelectAllVisibleProjects(event.target.checked)
    renderResults()
    return
  }
  if (event.target.matches('[data-select-project]')) {
    const key = event.target.dataset.selectionKey
    const project = projects.find((item) => projectSelectionKey(item) === key)
    if (event.target.checked && project) selectedProjects.set(key, createProjectSelection(project))
    else selectedProjects.delete(key)
    renderResults()
    return
  }
  if (event.target.dataset.dataFilter) {
    dataTableFilters[event.target.dataset.dataFilter] = event.target.value
    renderProjectDataResults()
    return
  }
  const key = event.target.dataset.filter
  if (!key) return
  if (key === 'status') setStatusFilter(event.target.value)
  else {
    filters[key] = event.target.value
    renderResults()
  }
})
document.addEventListener('click', async (event) => {
  if (event.target.matches('[data-select-project], [data-select-all]')) return
  const actionElement = event.target.closest('[data-action]')
  const action = actionElement?.dataset.action
  if (action === 'filter-status-card') {
    setStatusFilter(actionElement.dataset.statusCard)
    document.querySelector('#project-monitoring')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  if (action === 'reset-status-filter') {
    setStatusFilter('all')
    return
  }
  if (action === 'open-project-delete') {
    const selected = [...selectedProjects.values()]
    if (!selected.length) return
    deleteModalTrigger = actionElement
    document.querySelector('#detail-root').insertAdjacentHTML('beforeend', createDeleteProjectsModal(selected))
    document.body.classList.add('detail-open')
    document.querySelector('[data-delete-confirm]')?.focus()
    return
  }
  if (action === 'cancel-project-delete' && (event.target === actionElement || actionElement.closest('.delete-modal'))) {
    document.querySelector('.delete-modal-backdrop')?.remove()
    if (!document.querySelector('.detail-backdrop')) document.body.classList.remove('detail-open')
    deleteModalTrigger?.focus()
    return
  }
  if (action === 'confirm-project-delete') {
    const modal = actionElement.closest('.delete-modal')
    if (modal.querySelector('[data-delete-confirm]')?.value !== '삭제') return
    actionElement.disabled = true
    actionElement.textContent = '삭제 중...'
    modal.querySelectorAll('button, input').forEach((control) => { control.disabled = true })
    const deletingItems = [...selectedProjects.values()]
    const result = await deleteProjectsForTeacher(deletingItems, currentTeacher)
    if (result.deletedCount === 0) {
      modal.querySelectorAll('button, input').forEach((control) => { control.disabled = false })
      actionElement.textContent = '영구 삭제'
      actionElement.disabled = modal.querySelector('[data-delete-confirm]')?.value !== '삭제'
      const resultElement = modal.querySelector('.delete-result')
      if (resultElement) resultElement.textContent = result.message
      return
    }
    const deletedKeys = deletingItems.map((item) => item.selectionKey).filter((key) => !result.failedSelectionKeys.includes(key))
    deletedKeys.forEach((key) => selectedProjects.delete(key))
    let detailWasDeleted = false
    if (openDetailProjectId && deletingItems.some((item) => deletedKeys.includes(item.selectionKey) && item.documentId === openDetailProjectId)) {
      detailWasDeleted = true
      closeDetails()
    }
    document.querySelector('.delete-modal-backdrop')?.remove()
    document.body.classList.remove('detail-open')
    dashboardNotice = {
      type: result.failedCount > 0 ? 'partial' : 'success',
      message: `${result.message}${detailWasDeleted ? ' 현재 보고 있던 프로젝트가 삭제되었습니다.' : ''}`,
    }
    await loadProjects({ keepDashboard: true })
    return
  }
  if (action === 'teacher-logout') {
    actionElement.disabled = true
    projectsUnsubscribe?.()
    projectsUnsubscribe = null
    draftsUnsubscribe?.()
    draftsUnsubscribe = null
    const result = await signOutUser()
    if (result.success) location.replace('/index.html')
    else {
      actionElement.disabled = false
      dashboardNotice = { type: 'error', message: result.error }
      renderDashboard()
    }
    return
  }
  if (action === 'refresh' || action === 'retry-projects') { await loadProjects({ keepDashboard: true }); return }
  if (action === 'download-project-data-csv') {
    const csv = createTeacherDataCsv(visibleProjectDataRows(), (value) => value ? formatDate(value) : '')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date())
    link.href = url
    link.download = `arduino-projects-${today}.csv`
    link.click()
    URL.revokeObjectURL(url)
    return
  }
  if (action === 'view-data-row') {
    const item = allProjectDataRows().find((row) => row.source === actionElement.dataset.source && row.documentId === actionElement.dataset.documentId)
    if (!item) return
    document.querySelector('#detail-root').innerHTML = `<div class="detail-backdrop" data-action="close-detail"><aside class="detail-panel project-data-detail" role="dialog" aria-modal="true" aria-labelledby="data-detail-title"><div class="detail-header"><div><p>${escapeHtml(item.sourceLabel)}</p><h2 id="data-detail-title">${escapeHtml(item.title)}</h2><span>${escapeHtml(item.studentName)} · ${escapeHtml(item.studentEmail || '-')}</span></div><button type="button" class="detail-close" data-action="close-detail" aria-label="닫기">×</button></div><div class="detail-body">${section('읽기 전용 데이터', [field('상태', item.statusLabel), field('현재 단계', `${item.currentStep}단계`), field('진행률', `${item.progress}%`), field('마지막 저장일', formatDate(item.updatedAt)), field('제출일', formatDate(item.submittedAt)), field('승인일', formatDate(item.approvedAt)), field('컬렉션', item.source), field('문서 ID', item.documentId)])}</div></aside></div>`
    document.body.classList.add('detail-open')
    return
  }
  if (action === 'retry-auth') { permissionPending = false; await initializeTeacher(currentTeacher); return }
  if (action === 'close-detail' && (event.target === actionElement || event.target.closest('.detail-close'))) { closeDetails(); return }
  if (action === 'download-docx') {
    actionElement.disabled = true
    actionElement.textContent = '문서 생성 중...'
    const detail = await getProjectDetailForTeacher(actionElement.dataset.projectId, currentTeacher)
    const documentData = detail.success ? {
      ...fromProjectDocument(detail.project),
      status: detail.project.status,
      processLog: detail.project.processLog,
      createdAt: detail.project.createdAt,
      updatedAt: detail.project.updatedAt,
      approvedAt: detail.project.approvedAt,
      approvedBy: detail.project.approvedBy,
      approvedByName: detail.project.approvedByName,
    } : null
    const result = detail.success
      ? await downloadProjectPlanAsDocx(documentData, { displayName: detail.project.ownerName, email: detail.project.ownerEmail })
      : detail
    actionElement.disabled = false
    actionElement.textContent = 'Word 기획안 다운로드'
    const message = actionElement.parentElement?.querySelector('.detail-operation-message')
    if (message) {
      message.textContent = result.success ? 'Word 기획안 다운로드를 시작했습니다.' : result.error
      message.setAttribute('role', result.success ? 'status' : 'alert')
    }
    return
  }
  if (action === 'request-revision' || action === 'approve-project') {
    const panel = actionElement.closest('.teacher-review-panel')
    const reviewData = readTeacherReviewForm(panel)
    if (action === 'request-revision' && reviewData.feedback.replace(/\s/g, '').length < 10) {
      panel.querySelector('.review-message').textContent = '수정 요청 피드백을 공백 제외 10자 이상 입력해 주세요.'
      panel.querySelector('textarea')?.focus()
      return
    }
    if (action === 'approve-project') {
      const missing = Object.entries(reviewData.checklist).filter(([, checked]) => !checked).map(([key]) => reviewChecklistLabels[key])
      if (missing.length) {
        panel.querySelector('.review-message').textContent = `승인 전 다음 항목을 확인해 주세요: ${missing.join(', ')}`
        return
      }
    }
    const question = action === 'request-revision'
      ? '학생에게 수정 요청을 전달하시겠습니까?'
      : '이 프로젝트 기획안을 승인하시겠습니까?'
    if (!window.confirm(question)) return
    const buttons = panel.querySelectorAll('.review-actions button')
    buttons.forEach((button) => { button.disabled = true })
    actionElement.textContent = action === 'request-revision' ? '수정 요청 처리 중...' : '승인 처리 중...'
    let result
    try {
      result = action === 'request-revision'
        ? await requestRevision(actionElement.dataset.projectId, currentTeacher, reviewData)
        : await approveProject(actionElement.dataset.projectId, currentTeacher, reviewData)
    } catch (error) {
      if (import.meta.env.DEV) console.error('[교사 검토 호출 실패]', error)
      result = { success: false, error: '검토 결과 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }
    } finally {
      buttons.forEach((button) => { button.disabled = false })
      actionElement.textContent = action === 'request-revision' ? '수정 요청' : '승인 완료'
    }
    if (!result.success) {
      panel.querySelector('.review-message').textContent = result.error
      return
    }
    const index = projects.findIndex((project) => project.id === actionElement.dataset.projectId)
    if (index >= 0) {
      const previous = projects[index]
      const historyItem = { ...result.historyItem, reviewedAt: new Date(result.historyItem.reviewedAt) }
      projects[index] = {
        ...previous,
        status: result.status,
        updatedAt: new Date(),
        teacherReview: {
          status: result.status,
          feedback: reviewData.feedback,
          checklist: reviewData.checklist,
          requestedBy: currentTeacher?.uid || '',
          requestedByName: currentTeacher?.displayName || '교사',
          requestedAt: new Date(),
          studentRead: false,
          studentReadAt: null,
          reviewedBy: { displayName: currentTeacher?.displayName || '교사' },
          reviewedAt: new Date(),
          revisionCount: result.revisionCount,
          notification: result.status === 'revision_requested'
            ? { createdAt: new Date(), isRead: false, readAt: null, readBy: null }
            : previous.teacherReview?.notification ?? {},
        },
        reviewHistory: [...array(previous.reviewHistory), historyItem].slice(-10),
      }
    }
    renderDashboard()
    await openDetails(actionElement.dataset.projectId, null)
    document.querySelector('.review-message').textContent = result.message
    return
  }
  const trigger = event.target.closest('[data-project-id]')
  if (trigger?.dataset.source === 'drafts') trigger.querySelector('[data-action="view-data-row"]')?.click()
  else if (trigger) await openDetails(trigger.dataset.projectId, trigger)
})
document.addEventListener('keydown', (event) => {
  const deleteModal = document.querySelector('.delete-modal')
  if (deleteModal) {
    if (event.key === 'Escape') {
      document.querySelector('.delete-modal-backdrop')?.remove()
      if (!document.querySelector('.detail-backdrop')) document.body.classList.remove('detail-open')
      deleteModalTrigger?.focus()
      return
    }
    trapDeleteModalFocus(event, deleteModal)
    return
  }
  if (event.key === 'Escape' && document.body.classList.contains('detail-open')) closeDetails()
  const detailPanel = document.querySelector('.detail-panel[role="dialog"]')
  if (detailPanel && event.key === 'Tab') {
    const focusable = [...detailPanel.querySelectorAll('button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href]')]
    if (focusable.length) {
      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
  }
  if (event.target.matches('input, button, select, textarea, a')) return
  const row = event.target.closest('.project-row')
  if (row && (event.key === 'Enter' || event.key === ' ')) {
    event.preventDefault()
    if (row.dataset.source === 'drafts') row.querySelector('[data-action="view-data-row"]')?.click()
    else openDetails(row.dataset.projectId, row)
  }
})

export const checkTeacherPermission = (user) => isCurrentUserTeacher(user)
async function initializeTeacher(user) {
  if (initialized || permissionPending) return
  permissionPending = true
  currentTeacher = user
  renderState('교사 권한을 확인하고 있습니다.')
  const permission = await checkTeacherPermission(user)
  permissionPending = false
  if (!permission.success) {
    renderState(permission.message, '<button class="button button-primary" type="button" data-action="retry-auth">다시 시도</button>', false)
    return
  }
  if (!permission.isTeacher) {
    renderState('교사 권한이 필요한 페이지입니다.', '<a class="button button-primary" href="/index.html">첫 화면으로 이동</a>', false)
    setTimeout(() => location.replace('/index.html'), 1800)
    return
  }
  initialized = true
  await loadProjects()
}

renderState('교사 권한을 확인하고 있습니다.')
observeAuthState((user) => {
  if (!user) { location.replace('/index.html'); return }
  initializeTeacher(user)
})
