import { getTeamRoleLabel } from './teamRoles.js'

const text = (value) => String(value ?? '').trim()
const populated = (value) => typeof value === 'boolean'
  ? value
  : Array.isArray(value) ? value.some((item) => typeof item === 'object' ? Object.values(item).some(text) : text(item)) : text(value)

export function validateSubmissionData(data = {}) {
  const p = data.planningData ?? {}
  const completeMemberRoles = Array.isArray(p.memberRoles) && p.memberRoles.length > 0
    && p.memberRoles.every((item) => typeof item === 'string'
      ? text(item)
      : text(item?.member ?? item?.memberName ?? item?.name) && text(getTeamRoleLabel(item) || item?.role))
  const roleCombinations = Array.isArray(p.memberRoles)
    ? p.memberRoles.map((item) => typeof item === 'string' ? item : `${text(item?.member ?? item?.memberName ?? item?.name)}::${text(getTeamRoleLabel(item) || item?.role)}`)
    : []
  const uniqueMemberRoles = roleCombinations.length === new Set(roleCombinations).size
  const completeDifficultyPlans = Array.isArray(p.difficultyPlans) && p.difficultyPlans.length > 0
    && p.difficultyPlans.every((item) => text(item?.difficulty) && text(item?.solution))
  const required = [
    [data.projectName,'프로젝트명'],[data.oneLineSummary,'프로젝트 한 줄 소개'],[p.projectType,'프로젝트 유형'],
    [p.ideaDescription,'만들고 싶은 작품'],[p.selectionReason,'주제 선정 이유'],[p.targetUser,'대상 사용자'],
    [p.requiredFeatures,'핵심 기능'],[p.operationSteps,'전체 작동 순서'],
    [p.board,'사용 보드'],[p.parts,'부품 구성'],
    [completeMemberRoles && uniqueMemberRoles,'역할 분담'],[p.schedule,'제작 일정'],[completeDifficultyPlans,'어려움과 해결 계획'],[p.testPlans,'기능 테스트 계획'],
  ]
  return required.filter(([value]) => !populated(value)).map(([,label]) => label)
}

export function validateAiReviewData(data = {}) {
  const p = data.planningData ?? {}
  return [[data.projectName,'프로젝트명'],[p.projectType,'프로젝트 유형'],[p.ideaDescription,'만들고 싶은 작품'],[p.selectionReason,'주제 선정 이유'],[p.targetUser,'대상 사용자'],[p.requiredFeatures,'핵심 기능'],[p.operationSteps,'전체 작동 순서'],[p.board,'사용 보드'],[p.parts,'부품']].filter(([value]) => !populated(value)).map(([,label]) => label)
}
