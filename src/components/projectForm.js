import { escapeHtml } from '../utils/helpers.js'
import { teamRoleOptions } from '../utils/teamRoles.js'

let activeErrors = {}
const error = (path) => activeErrors[path] ? `<p class="field-error">${activeErrors[path]}</p>` : ''
const field = ({ label, path, value, placeholder = '', required = true, type = 'text' }) => `<label class="field"><span>${label}${required ? '<b aria-hidden="true"> *</b>' : ''}</span><input type="${type}" name="${path}" value="${escapeHtml(value)}" placeholder="${placeholder}" ${required ? 'required' : ''}/><span class="error-slot" data-error-for="${path}">${error(path)}</span></label>`
const textarea = ({ label, path, value, placeholder = '', required = true, rows = 3 }) => `<label class="field field-wide"><span>${label}${required ? '<b aria-hidden="true"> *</b>' : ''}</span><textarea name="${path}" rows="${rows}" placeholder="${placeholder}" ${required ? 'required' : ''}>${escapeHtml(value)}</textarea><span class="error-slot" data-error-for="${path}">${error(path)}</span></label>`

const projectTypes = ['생활 문제 해결형', '기존 작품 재현·응용형', '게임·놀이 제작형', '편의 기능 제작형', '예술·표현형', '센서·기술 탐구형', '자유 주제']
const coreValues = ['편리함', '안전', '재미', '교육', '표현', '자동화', '환경', '기술 탐구', '기타']
const formatWonInput = (value) => {
  const digits = String(value ?? '').replace(/[^\d]/g, '')
  return digits ? Number(digits).toLocaleString('ko-KR') : ''
}

function repeatText(path, rows, label, placeholder, required = false) {
  return `<div class="field field-wide repeat-field"><div class="field-heading"><span>${label}${required ? '<b aria-hidden="true"> *</b>' : ''}</span></div><div class="repeat-list">${rows.map((item, index) => `<div class="repeat-card"><span class="row-number">${index + 1}</span><input data-row-path="${path}" data-id="${item.id}" data-row-field="value" value="${escapeHtml(item.value)}" placeholder="${placeholder}"/><button class="icon-button" type="button" data-action="remove-row" data-path="${path}" data-id="${item.id}" ${rows.length === 1 ? 'disabled' : ''}>삭제</button></div>`).join('')}</div><button class="text-button add-row-button" type="button" data-action="add-row" data-path="${path}">+ 항목 추가</button><span class="error-slot">${error(path)}</span></div>`
}

function tableRows(path, rows, columns) {
  return `<div class="field field-wide structured-field"><div class="field-heading"><span>${columns.title} <b aria-hidden="true">*</b></span><button class="text-button" type="button" data-action="add-row" data-path="${path}">+ 행 추가</button></div><div class="structured-table"><div class="structured-head">${columns.fields.map((column) => `<span>${column.label}</span>`).join('')}<span></span></div>${rows.map((item) => `<div class="structured-row">${columns.fields.map((column) => `<input data-row-path="${path}" data-id="${item.id}" data-row-field="${column.key}" value="${escapeHtml(item[column.key])}" placeholder="${column.placeholder || column.label}"/>`).join('')}<button class="icon-button" type="button" data-action="remove-row" data-path="${path}" data-id="${item.id}" ${rows.length === 1 ? 'disabled' : ''}>삭제</button></div>`).join('')}</div><span class="error-slot">${error(path)}</span></div>`
}

function renderMemberOptions(teamMembers, selectedMemberId = '') {
  return teamMembers.map((member) => `<option value="${escapeHtml(member.id)}" ${member.id === selectedMemberId ? 'selected' : ''}>${escapeHtml(member.name)}</option>`).join('')
}

function renderMemberRoles(state) {
  const members = state.basic.members.filter((member) => member.id && String(member.name ?? '').trim())
  return `<div class="field field-wide structured-field"><div class="field-heading"><span>팀원별 역할 분담 <b aria-hidden="true">*</b></span><button class="text-button" type="button" data-action="add-row" data-path="production.memberRoles">+ 행 추가</button></div>
    ${members.length ? '' : '<p class="field-guidance">1단계 기본 정보에서 팀원을 먼저 입력해 주세요.</p>'}
    <div class="structured-table"><div class="structured-head"><span>팀원</span><span>담당 역할</span><span></span></div>${state.production.memberRoles.map((item) => {
      const selectedRoles = Array.isArray(item.roleTypes) ? item.roleTypes : item.roleType ? [item.roleType] : []
      return `<div class="structured-row role-assignment-row"><select data-row-path="production.memberRoles" data-id="${item.id}" data-row-field="memberId" ${members.length ? '' : 'disabled'}><option value="">팀원 선택</option>${renderMemberOptions(members, item.memberId)}</select><fieldset class="role-multi-select"><legend>담당 역할 선택</legend><div>${teamRoleOptions.map(([type,label]) => `<label class="${selectedRoles.includes(type) ? 'is-selected' : ''}"><input type="checkbox" data-action="toggle-team-role" data-id="${item.id}" value="${type}" ${selectedRoles.includes(type) ? 'checked' : ''}/><span>${label}</span></label>`).join('')}</div></fieldset><button class="icon-button" type="button" data-action="remove-row" data-path="production.memberRoles" data-id="${item.id}" ${state.production.memberRoles.length === 1 ? 'disabled' : ''}>삭제</button>${selectedRoles.includes('other') ? `<label class="custom-role-field"><span>기타 담당 역할</span><input data-row-path="production.memberRoles" data-id="${item.id}" data-row-field="customRole" value="${escapeHtml(item.customRole)}" placeholder="기타 역할을 입력하세요"/></label>` : ''}</div>`
    }).join('')}</div><span class="error-slot">${error('production.memberRoles')}</span></div>`
}

function renderBasic(state) {
  const members = state.basic.members.map((member, index) => `<div class="repeat-row member-row"><label class="sr-only" for="member-${member.id}">팀원 ${index + 1}</label><input id="member-${member.id}" name="memberName" data-id="${member.id}" value="${escapeHtml(member.name)}" placeholder="팀원 이름"/><button class="icon-button" type="button" data-action="remove-member" data-id="${member.id}" ${state.basic.members.length === 1 ? 'disabled' : ''}>삭제</button></div>`).join('')
  return `<p class="step-purpose">생활 속 문제 해결, 기존 작품의 재현과 응용, 게임·놀이, 예술 표현, 센서 탐구 등 다양한 주제로 프로젝트를 기획할 수 있습니다.</p><div class="form-grid">
    <label class="field"><span>학년 <b>*</b></span><select name="basic.grade" required><option value="">학년 선택</option>${[1,2,3].map((grade) => `<option value="${grade}" ${String(grade) === state.basic.grade ? 'selected' : ''}>${grade}학년</option>`).join('')}</select>${error('basic.grade')}</label>
    ${field({ label:'반', path:'basic.className', value:state.basic.className })}${field({ label:'팀명', path:'basic.teamName', value:state.basic.teamName })}${field({ label:'프로젝트명', path:'basic.projectName', value:state.basic.projectName })}${field({ label:'프로젝트 한 줄 소개', path:'basic.summary', value:state.basic.summary })}${field({ label:'예상 제작 기간', path:'basic.duration', value:state.basic.duration })}
    <label class="field field-wide"><span>프로젝트 유형 <b>*</b></span><select name="basic.projectType" required><option value="">유형 선택</option>${projectTypes.map((type) => `<option ${state.basic.projectType === type ? 'selected' : ''}>${type}</option>`).join('')}</select><span class="error-slot">${error('basic.projectType')}</span></label>
    <div class="field field-wide"><div class="field-heading"><span>팀원 <b>*</b></span><button class="text-button" type="button" data-action="add-member">+ 팀원 추가</button></div><div class="repeat-list">${members}</div>${error('basic.members')}</div>
  </div>`
}

function renderIntent(state) {
  return `<p class="step-purpose">어떤 작품을 왜 만들고 싶은지 간단하게 정리해 보세요.</p><div class="form-grid single-column">
    ${textarea({label:'어떤 작품을 만들고 싶은가?',path:'intent.ideaDescription',value:state.intent.ideaDescription})}${textarea({label:'이 주제를 선택한 이유는 무엇인가?',path:'intent.selectionReason',value:state.intent.selectionReason})}${textarea({label:'이 작품은 누구를 위한 것인가?',path:'intent.targetUser',value:state.intent.targetUser})}${textarea({label:'참고하거나 응용한 작품이 있는가?',path:'intent.referenceProject',value:state.intent.referenceProject,required:false})}${textarea({label:'기존 작품 또는 아이디어와 다르게 만들 부분은 무엇인가?',path:'intent.differentiation',value:state.intent.differentiation,required:false})}
    <fieldset class="choice-field"><legend>프로젝트에서 가장 중요하게 구현할 가치 <b>*</b></legend><div class="choice-grid">${coreValues.map((value) => `<label class="choice-option ${state.intent.coreValues.includes(value) ? 'is-selected' : ''}"><input type="checkbox" data-action="toggle-core-value" value="${value}" ${state.intent.coreValues.includes(value) ? 'checked' : ''}/><span>${value}</span></label>`).join('')}</div>${state.intent.coreValues.includes('기타') ? field({label:'기타 가치',path:'intent.otherCoreValue',value:state.intent.otherCoreValue}) : ''}${error('intent.coreValues')}</fieldset>
  </div>`
}

function renderFeatures(state) {
  return `<p class="step-purpose">구현할 기능과 필요한 보드·부품을 함께 연결하여 설계해 보세요.</p><div class="form-grid single-column design-form">
    ${repeatText('features.requiredFeatures',state.features.requiredFeatures,'반드시 구현할 핵심 기능','기능을 한 가지씩 입력하세요',true)}
    ${repeatText('features.optionalFeatures',state.features.optionalFeatures,'시간이 남으면 구현할 추가 기능','선택 기능')}
    ${repeatText('features.operationSteps',state.features.operationSteps,'작품의 전체 작동 순서','한 단계씩 입력하세요',true)}
  </div>`
}

function renderProduction(state) {
  return `<p class="step-purpose">팀원 역할과 일정을 정하고, 예상되는 어려움과 해결 방법, 기능이 정상 작동하는지 확인할 계획을 작성해 보세요.</p><div class="form-grid single-column">
    ${renderMemberRoles(state)}
    ${tableRows('production.schedule',state.production.schedule,{title:'제작 일정',fields:[{key:'period',label:'차시 또는 기간'},{key:'goal',label:'목표'}]})}
    ${tableRows('production.difficultyPlans',state.production.difficultyPlans,{title:'어려움과 해결 계획',fields:[{key:'difficulty',label:'예상되는 어려움',placeholder:'예: LCD 화면이 정상적으로 출력되지 않을 수 있음'},{key:'solution',label:'해결 방법',placeholder:'예: 배선과 I2C 주소를 확인하고 예제 코드 참고'}]})}
    ${textarea({label:'안전 및 준비 사항',path:'production.safetyAndPreparation',value:state.production.safetyAndPreparation,placeholder:'납땜, 글루건, 칼, 모터, 외부 전원 등 제작 과정에서 주의하거나 준비할 사항이 있다면 작성하세요.',required:false,rows:5})}
    <label class="field cost-field"><span>예상 제작 비용</span><div class="cost-input"><input type="text" inputmode="numeric" name="production.budget" value="${formatWonInput(state.production.budget)}" placeholder="10,000"/><span>원</span></div><span class="error-slot" data-error-for="production.budget">${error('production.budget')}</span></label>
    ${tableRows('production.testPlans',state.production.testPlans,{title:'기능 테스트 계획',fields:[{key:'feature',label:'확인할 기능',placeholder:'예: 버튼을 누르면 게임 시작'},{key:'method',label:'확인 방법',placeholder:'예: 버튼을 10회 눌러 작동 여부 확인'},{key:'successCondition',label:'정상 작동 기준',placeholder:'예: 10회 중 9회 이상 정상 작동'}]})}
  </div>`
}

export function createProjectForm(step, state, errors = {}) {
  activeErrors = errors
  const renderers = {1:renderBasic,2:renderIntent,3:renderFeatures,4:renderProduction}
  return `<form id="project-form-step-${step}" class="project-form" novalidate>${renderers[step]?.(state) ?? ''}</form>`
}
