import { escapeHtml } from '../utils/helpers.js'
import { normalizeProjectForOutput } from '../utils/projectOutput.js'

const invalid = (value) => !String(value ?? '').trim() || /^[,\s]+$/.test(String(value)) || ['undefined','null','[object Object]'].includes(String(value).trim())
const show = (value) => escapeHtml(invalid(value) ? '작성되지 않음' : value).replaceAll('\n','<br />')
const won = (value) => {
  const number = Number(String(value ?? '').replace(/[^\d]/g, ''))
  return String(value ?? '').trim() && Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : ''
}
const infoRows = (rows) => `<dl class="preview-list">${rows.map(([label,value]) => `<div><dt>${label}</dt><dd>${show(value)}</dd></div>`).join('')}</dl>`
const optionalRows = (rows) => rows.filter(([,value]) => !invalid(value))
const table = (heads, rows) => `<div class="preview-table"><div>${heads.map((head) => `<strong>${head}</strong>`).join('')}</div>${rows.length ? rows.map((cells) => `<div>${cells.map((cell) => `<span>${show(cell)}</span>`).join('')}</div>`).join('') : `<p class="empty-copy">작성되지 않음</p>`}</div>`

export function createPlanPreview(state) {
  const output = normalizeProjectForOutput(state)
  const sections = [
    {step:1,title:'프로젝트 기본 정보',body:infoRows([['학년 / 반',`${state.basic.grade ? `${state.basic.grade}학년` : ''} ${state.basic.className}`],['팀명',state.basic.teamName],['팀원',state.basic.members.map((member) => member.name).filter(Boolean).join(', ')],['프로젝트명',state.basic.projectName],['한 줄 소개',state.basic.summary],['예상 제작 기간',state.basic.duration],['프로젝트 유형',state.basic.projectType]])},
    {step:2,title:'아이디어와 제작 목적',body:infoRows([['만들고 싶은 작품',state.intent.ideaDescription],['주제 선정 이유',state.intent.selectionReason],['대상 사용자',state.intent.targetUser],['핵심 가치',[...state.intent.coreValues,state.intent.otherCoreValue].filter(Boolean).join(', ')],...optionalRows([['참고 작품',state.intent.referenceProject],['차별점',state.intent.differentiation]])])},
    {step:3,title:'기능 및 하드웨어 설계',body:`${infoRows([['핵심 기능',output.requiredFeatures.join('\n')],...optionalRows([['추가 기능',output.optionalFeatures.join('\n')]]),['전체 작동 순서',output.operationSteps.map((item,index) => `${index+1}. ${item}`).join('\n')],['사용 보드',output.board],...optionalRows([['핀·전원 주의사항',output.pinConditions]])])}${table(['구분','부품명','수량','역할(선택)','보유 여부'],output.parts.map((part) => [{input:'입력',output:'출력',other:'기타'}[part.category],part.name,`${part.quantity}개`,part.role || '—',{owned:'보유',purchase:'구매 필요',check:'확인 필요'}[part.availability] || (part.owned ? '보유' : '확인 필요')]))}`},
    {step:4,title:'제작 계획 및 테스트',body:`<h4 class="preview-subtitle">팀원별 역할 분담</h4>${table(['팀원','담당 역할'],output.memberRoles.map((item) => [item.memberName,item.role]))}<h4 class="preview-subtitle">제작 일정</h4>${table(['차시 또는 기간','목표'],output.schedule.map((item) => [item.period,item.goal]))}<h4 class="preview-subtitle">어려움과 해결 계획</h4>${table(['예상되는 어려움','해결 방법'],output.difficultyPlans.map((item) => [item.difficulty,item.solution]))}${infoRows(optionalRows([['안전 및 준비 사항',output.safetyAndPreparation],['예상 제작 비용',won(output.estimatedCost)]]))}<h4 class="preview-subtitle">기능 테스트 계획</h4>${table(['확인할 기능','확인 방법','정상 작동 기준'],output.testPlans.map((item) => [item.feature,item.method,item.successCondition]))}`},
  ]
  return `<section class="plan-preview"><div class="preview-cover"><p>ARDUINO PROJECT PLAN</p><h3>${show(state.basic.projectName)}</h3><span>${show(state.basic.teamName)}</span></div>${sections.map((section) => `<article class="preview-section"><div class="preview-heading"><h3><span>0${section.step}</span>${section.title}</h3><button class="text-button" type="button" data-action="edit-step" data-step="${section.step}">수정</button></div>${section.body}</article>`).join('')}</section>`
}
