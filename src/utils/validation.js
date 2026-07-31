import { getTeamRoleLabel } from './teamRoles.js'

const text = (value) => String(value ?? '').trim()
const hasRow = (rows, fields = ['value']) => Array.isArray(rows) && rows.some((row) => fields.every((field) => text(row[field])))

export function validateStep(step, state) {
  const errors = {}
  const require = (path, value, message) => { if (!text(value)) errors[path] = message }
  if (step === 1) {
    ;[['basic.grade',state.basic.grade,'학년을 선택해 주세요.'],['basic.className',state.basic.className,'반을 입력해 주세요.'],['basic.teamName',state.basic.teamName,'팀명을 입력해 주세요.'],['basic.projectName',state.basic.projectName,'프로젝트명을 입력해 주세요.'],['basic.summary',state.basic.summary,'프로젝트 한 줄 소개를 입력해 주세요.'],['basic.duration',state.basic.duration,'예상 제작 기간을 입력해 주세요.'],['basic.projectType',state.basic.projectType,'프로젝트 유형을 선택해 주세요.']].forEach((args) => require(...args))
    if (!state.basic.members.some((member) => text(member.name))) errors['basic.members'] = '팀원을 한 명 이상 입력해 주세요.'
  }
  if (step === 2) {
    ;[['intent.ideaDescription',state.intent.ideaDescription,'만들고 싶은 작품을 입력해 주세요.'],['intent.selectionReason',state.intent.selectionReason,'주제 선정 이유를 입력해 주세요.'],['intent.targetUser',state.intent.targetUser,'누구를 위한 작품인지 입력해 주세요.']].forEach((args) => require(...args))
    if (!state.intent.coreValues.length) errors['intent.coreValues'] = '중요 가치를 한 개 이상 선택해 주세요.'
    if (state.basic.projectType === '생활 문제 해결형') {
      require('intent.problemSituation',state.intent.problemSituation,'해결하고 싶은 문제를 입력해 주세요.')
      require('intent.improvementDirection',state.intent.improvementDirection,'개선하고 싶은 내용을 입력해 주세요.')
    }
  }
  if (step === 3) {
    if (!hasRow(state.features.requiredFeatures)) errors['features.requiredFeatures'] = '핵심 기능을 한 개 이상 입력해 주세요.'
    if (!hasRow(state.features.operationSteps)) errors['features.operationSteps'] = '전체 작동 순서를 한 개 이상 입력해 주세요.'
    require('hardware.board',state.hardware.board,'사용할 보드를 선택해 주세요.')
    if (state.hardware.board === '기타 직접 입력') require('hardware.customBoard',state.hardware.customBoard,'기타 보드명을 입력해 주세요.')
    const selectedParts = state.hardware.parts.filter((part) => part.isActive !== false)
    const inputOrOutputParts = selectedParts.filter((part) => ['input','output'].includes(part.category))
    if (!inputOrOutputParts.length || inputOrOutputParts.some((part) => !text(part.name))) errors['hardware.parts'] = '입력 또는 출력 부품을 한 개 이상 선택해 주세요.'
  }
  if (step === 4) {
    if (state.production.memberRoles.some((item) => !text(item.member))) errors['production.memberRoles'] = '역할 분담의 팀원을 선택해 주세요.'
    else if (state.production.memberRoles.some((item) => !(Array.isArray(item.roleTypes) ? item.roleTypes.length : text(item.roleType)))) errors['production.memberRoles'] = '담당 역할을 하나 이상 선택해 주세요.'
    else if (state.production.memberRoles.some((item) => (item.roleTypes ?? [item.roleType]).includes('other') && !text(item.customRole))) errors['production.memberRoles'] = '기타 담당 역할을 입력해 주세요.'
    else {
      const combinations = state.production.memberRoles.map((item) => `${text(item.member)}::${getTeamRoleLabel(item)}`)
      if (new Set(combinations).size !== combinations.length) errors['production.memberRoles'] = '같은 팀원과 담당 역할이 중복되어 있습니다.'
    }
    if (!hasRow(state.production.schedule,['period','goal'])) errors['production.schedule'] = '제작 일정을 한 행 이상 작성해 주세요.'
    if (!hasRow(state.production.difficultyPlans,['difficulty','solution'])) errors['production.difficultyPlans'] = '어려움과 해결 방법을 한 행 이상 작성해 주세요.'
    else if (state.production.difficultyPlans.some((item) => text(item.difficulty) !== '' !== (text(item.solution) !== ''))) errors['production.difficultyPlans'] = '어려움과 해결 방법을 함께 입력해 주세요.'
    if (!hasRow(state.production.testPlans,['feature','method','successCondition'])) errors['production.testPlans'] = '기능별 테스트 계획을 작성해 주세요.'
  }
  return errors
}
