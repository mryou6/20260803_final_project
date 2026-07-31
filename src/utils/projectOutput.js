import { getTeamRoleLabel, normalizeTeamRole } from './teamRoles.js'

const invalidText = new Set(['undefined', 'null', '[object Object]', 'nan', 'invalid date'])

export function hasMeaningfulValue(value) {
  if (value === undefined || value === null) return false
  if (Array.isArray(value)) return value.some(hasMeaningfulValue)
  if (typeof value === 'object') return Object.values(value).some(hasMeaningfulValue)
  const text = String(value).trim()
  return Boolean(text) && !/^[,\s]+$/.test(text) && !invalidText.has(text.toLowerCase())
}

export function firstValidValue(...values) {
  return values.find(hasMeaningfulValue)
}

const cleanText = (value) => hasMeaningfulValue(value) && typeof value !== 'object' ? String(value).trim() : ''

export function normalizeTextArray(value, keys = ['value', 'text', 'content', 'description', 'feature', 'step']) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string' ? value.split(/\r?\n|,\s*/) : []
  return source.map((item) => {
    if (typeof item !== 'object' || item === null) return cleanText(item)
    return cleanText(firstValidValue(...keys.map((key) => item[key])))
  }).filter(Boolean)
}

export function normalizeMemberRoles(value) {
  return (Array.isArray(value) ? value : []).map((item) => {
    if (typeof item === 'string') {
      const [member = '', ...role] = item.split(/\s*(?:\||→|->| - |:)\s*/)
      return { memberName: cleanText(member), role: cleanText(role.join(' - ')) }
    }
    const normalized = normalizeTeamRole(item)
    return {
      memberName: cleanText(item?.memberName ?? item?.member ?? item?.name ?? normalized.member),
      role: cleanText(getTeamRoleLabel(item) || item?.role || (Array.isArray(item?.roles) ? item.roles.join(', ') : '')),
    }
  }).filter((item) => item.memberName && item.role)
}

export function normalizeSchedule(value) {
  return (Array.isArray(value) ? value : []).map((item) => ({
    period: cleanText(firstValidValue(item?.period, item?.session, item?.duration, item?.time, item?.label)),
    goal: cleanText(firstValidValue(item?.goal, item?.objective, item?.task, item?.content, item?.target)),
  })).filter((item) => item.period || item.goal)
}

export function normalizeDifficultyPlans(value, legacyProblems, legacySolutions) {
  if (Array.isArray(value) && value.some(hasMeaningfulValue)) {
    return value.map((item) => ({
      difficulty: cleanText(firstValidValue(item?.difficulty, item?.problem, item?.issue, item?.expectedProblem)),
      solution: cleanText(firstValidValue(item?.solution, item?.response, item?.method, item?.copingPlan)),
    })).filter((item) => item.difficulty || item.solution)
  }
  const problems = normalizeTextArray(legacyProblems)
  const solutions = normalizeTextArray(legacySolutions)
  return Array.from({ length: Math.max(problems.length, solutions.length) }, (_, index) => ({
    difficulty: problems[index] ?? '',
    solution: solutions[index] ?? '',
  })).filter((item) => item.difficulty || item.solution)
}

export function normalizeTestPlans(value) {
  return (Array.isArray(value) ? value : []).map((item) => ({
    feature: cleanText(firstValidValue(item?.feature, item?.targetFeature, item?.testFeature)),
    method: cleanText(firstValidValue(item?.method, item?.testMethod, item?.procedure)),
    successCondition: cleanText(firstValidValue(item?.successCondition, item?.criterion, item?.expectedResult, item?.passCondition)),
  })).filter((item) => item.feature || item.method || item.successCondition)
}

const normalizeParts = (value) => (Array.isArray(value) ? value : []).map((part) => ({
  category: cleanText(part?.category),
  name: cleanText(part?.name),
  quantity: Math.max(1, Number(part?.quantity) || 1),
  role: cleanText(part?.role),
  availability: cleanText(part?.availability),
  owned: typeof part?.owned === 'boolean' ? part.owned : undefined,
})).filter((part) => part.name)

export function normalizeProjectForOutput(project = {}) {
  const planning = project.planningData ?? project.planning ?? {}
  const features = project.functionHardware ?? project.design ?? project.features ?? {}
  const hardware = project.hardware ?? {}
  const production = project.productionPlan ?? project.production ?? {}
  return {
    requiredFeatures: normalizeTextArray(firstValidValue(features.requiredFeatures, features.coreFeatures, planning.requiredFeatures, project.requiredFeatures)),
    optionalFeatures: normalizeTextArray(firstValidValue(features.optionalFeatures, features.additionalFeatures, planning.optionalFeatures, project.optionalFeatures)),
    operationSteps: normalizeTextArray(firstValidValue(features.operationSteps, features.operationScenario, planning.operationSteps, planning.operationScenario, project.operationSteps), ['value', 'text', 'content', 'description', 'step']),
    board: cleanText(firstValidValue(hardware.board, features.board, planning.board)),
    parts: normalizeParts(firstValidValue(hardware.parts, features.parts, planning.parts)),
    pinConditions: cleanText(firstValidValue(hardware.pinConditions, hardware.powerRequirements, hardware.driverRequirements, features.pinConditions, planning.pinConditions, planning.pinPlan, planning.powerPlan)),
    memberRoles: normalizeMemberRoles(firstValidValue(production.memberRoles, production.roleAssignments, planning.memberRoles, project.memberRoles)),
    schedule: normalizeSchedule(firstValidValue(production.schedule, production.timeline, planning.schedule, project.schedule)),
    difficultyPlans: normalizeDifficultyPlans(firstValidValue(production.difficultyPlans, planning.difficultyPlans, project.difficultyPlans), firstValidValue(production.expectedProblems, planning.expectedProblems), firstValidValue(production.solutions, planning.solutions)),
    safetyAndPreparation: normalizeTextArray(firstValidValue(production.safetyAndPreparation, planning.safetyAndPreparation, production.safetyNotes, planning.safetyNotes)).join('\n')
      || cleanText(firstValidValue(production.safetyAndPreparation, planning.safetyAndPreparation)),
    estimatedCost: firstValidValue(production.estimatedCost, production.budget, planning.estimatedCost, project.estimatedCost),
    testPlans: normalizeTestPlans(firstValidValue(production.testPlans, production.featureTests, planning.testPlans, project.testPlans)),
  }
}
