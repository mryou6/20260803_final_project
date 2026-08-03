import { getTeamRoleLabel } from '../utils/teamRoles.js'
const CHECK_OPENAI_ENDPOINT = '/.netlify/functions/check-openai'
const REVIEW_PROJECT_ENDPOINT = '/.netlify/functions/review-project'
const inFlight = new Set()
const text = (value) => String(value ?? '').trim()
const array = (value) => Array.isArray(value) ? value : []

export async function checkOpenAiConnection() {
  console.info('[OpenAI 연결 확인 시작]', {
    requestUrl: CHECK_OPENAI_ENDPOINT,
    functionName: 'checkOpenAiConnection',
  })
  try {
    const response = await fetch(CHECK_OPENAI_ENDPOINT, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' })
    const payload = await response.json().catch(() => null)
    console.info('[OpenAI 연결 응답]', {
      requestUrl: CHECK_OPENAI_ENDPOINT,
      responseStatus: response.status,
      responseOk: response.ok,
      errorName: payload?.errorCode ?? null,
      errorMessage: payload?.message ?? null,
      functionName: 'checkOpenAiConnection',
    })
    return response.ok && payload?.success === true
      ? { success: true, message: 'OpenAI API 연결이 확인되었습니다.' }
      : {
        success: false,
        errorCode: payload?.errorCode ?? `OPENAI_HTTP_${response.status}`,
        status: response.status,
        error: payload?.message ?? `OpenAI 연결 확인 요청이 HTTP ${response.status}로 실패했습니다.`,
      }
  } catch (error) {
    console.error('[OpenAI 연결 실패]', {
      requestUrl: CHECK_OPENAI_ENDPOINT,
      responseStatus: null,
      responseOk: false,
      errorName: error?.name ?? 'Error',
      errorMessage: error?.message ?? 'Unknown error',
      functionName: 'checkOpenAiConnection',
    })
    return { success: false, errorCode: 'OPENAI_NETWORK_ERROR', error: error?.message }
  }
}

function planningPayload(projectData = {}) {
  const planning = projectData.planningData ?? {}
  return {
    projectName: text(projectData.projectName),
    oneLineSummary: text(projectData.oneLineSummary),
    projectType: text(planning.projectType),
    ideaDescription: text(planning.ideaDescription),
    referenceProject: text(planning.referenceProject),
    differentiation: text(planning.differentiation),
    coreValues: array(planning.coreValues),
    targetUser: text(planning.targetUser),
    existingSolution: text(planning.existingSolution),
    limitation: text(planning.limitation),
    selectionReason: text(planning.selectionReason),
    requiredFeatures: array(planning.requiredFeatures),
    optionalFeatures: array(planning.optionalFeatures),
    operationSteps: array(planning.operationSteps),
    operationScenario: array(planning.operationSteps).join('\n') || text(planning.operationScenario),
    expectedDuration: text(projectData.expectedDuration),
    memberRoles: array(planning.memberRoles).map((item) => ({
      memberName: text(item?.member ?? item?.memberName ?? item?.name),
      role: text(getTeamRoleLabel(item) || item?.role),
    })).filter((item) => item.memberName && item.role),
    schedule: array(planning.schedule),
    difficultyPlans: array(planning.difficultyPlans).map((item) => ({
      difficulty: text(item?.difficulty),
      solution: text(item?.solution),
    })).filter((item) => item.difficulty || item.solution),
    safetyAndPreparation: text(planning.safetyAndPreparation),
    estimatedCost: Math.max(0, Number(planning.estimatedCost) || 0),
    testPlans: array(planning.testPlans).map((item) => ({
      feature: text(item?.feature),
      method: text(item?.method),
      successCondition: text(item?.successCondition),
    })).filter((item) => item.feature && item.method && item.successCondition),
  }
}

function hardwarePayload(projectData = {}) {
  const planning = projectData.planningData ?? {}
  const parts = array(planning.parts)
  const minimal = (part) => ({ name: text(part?.name), quantity: Math.max(1, Number(part?.quantity) || 1), role: text(part?.role), availability: text(part?.availability) })
  return {
    projectName: text(projectData.projectName),
    requiredFeatures: array(planning.requiredFeatures),
    operationScenario: text(planning.operationScenario),
    board: text(planning.board),
    inputParts: parts.filter((part) => part?.category === 'input').map(minimal),
    outputParts: parts.filter((part) => part?.category !== 'input').map(minimal),
    otherParts: parts.filter((part) => part?.category === 'other').map(minimal),
    powerRequirements: text(planning.powerRequirements || planning.powerPlan),
    driverRequirements: text(planning.driverRequirements),
    pinConditions: text(planning.pinConditions || planning.pinPlan),
    estimatedCost: planning.estimatedCost,
    safetyNotes: array(planning.safetyNotes),
  }
}

const errorMessages = {
  AI_REVIEW_TIMEOUT: 'AI 검토 시간이 초과되었습니다. 다시 시도해 주세요.',
  OPENAI_RATE_LIMIT: 'AI 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.',
  OPENAI_AUTH_ERROR: 'OpenAI API 인증 정보를 확인해 주세요.',
  INVALID_REQUEST: '검토할 프로젝트 정보가 부족합니다.',
  JSON_PARSE_FAILED: 'AI 응답 형식을 처리하지 못했습니다. 다시 시도해 주세요.',
}

export async function reviewProject(projectData, reviewType, { onSlow } = {}) {
  if (!['planning', 'hardware'].includes(reviewType)) return { success: false, errorCode: 'INVALID_REQUEST', error: errorMessages.INVALID_REQUEST }
  if (inFlight.size) return { success: false, errorCode: 'REQUEST_IN_PROGRESS', error: '다른 AI 검토가 이미 진행 중입니다.' }
  inFlight.add(reviewType)
  const controller = new AbortController()
  const abortTimer = window.setTimeout(() => controller.abort(), 21000)
  const slowTimer = window.setTimeout(() => onSlow?.(), 15000)
  try {
    const response = await fetch(REVIEW_PROJECT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ reviewType, project: reviewType === 'planning' ? planningPayload(projectData) : hardwarePayload(projectData) }),
      signal: controller.signal,
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || payload?.success !== true || !payload.review) {
      const errorCode = payload?.errorCode || 'AI_REVIEW_FAILED'
      return { success: false, errorCode, error: errorMessages[errorCode] || payload?.message || 'AI 검토를 완료하지 못했습니다.' }
    }
    return { success: true, reviewType, review: payload.review }
  } catch (error) {
    const errorCode = error?.name === 'AbortError' ? 'AI_REVIEW_TIMEOUT' : 'AI_REVIEW_FAILED'
    return { success: false, errorCode, error: errorMessages[errorCode] || 'AI 검토를 완료하지 못했습니다.' }
  } finally {
    window.clearTimeout(abortTimer)
    window.clearTimeout(slowTimer)
    inFlight.delete(reviewType)
  }
}

export const reviewPlanning = (projectData, options) => reviewProject(projectData, 'planning', options)
export const reviewHardware = (projectData, options) => reviewProject(projectData, 'hardware', options)
