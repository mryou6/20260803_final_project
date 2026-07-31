import OpenAI from 'openai'

const REVIEW_MODEL = 'gpt-5.4-mini'
const OPENAI_TIMEOUT_MS = 18000
const MAX_OUTPUT_TOKENS = 850
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
const reply = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })
const elapsed = (startedAt) => `${Date.now() - startedAt}ms`

const cleanText = (value, max = 500) => {
  if (value === undefined || value === null || typeof value === 'object') return ''
  const result = String(value).replace(/<[^>]*>/g, ' ').replace(/[\u0000-\u001F]/g, ' ').replace(/\s+/g, ' ').trim()
  return result && !/^[,\s]+$/.test(result) && !['undefined', 'null', '[object Object]'].includes(result)
    ? result.slice(0, max)
    : ''
}
const cleanArray = (value, limit = 8) => (Array.isArray(value) ? value : [])
  .map((item) => cleanText(item, 500)).filter(Boolean).slice(0, limit)
const cleanParts = (value) => (Array.isArray(value) ? value : []).map((part) => ({
  name: cleanText(part?.name, 120),
  quantity: Math.max(1, Number(part?.quantity) || 1),
  role: cleanText(part?.role, 200),
})).filter((part) => part.name).slice(0, 20)
const cleanRoles = (value) => (Array.isArray(value) ? value : []).map((item) => ({
  memberName: cleanText(item?.memberName ?? item?.member ?? item?.name, 120),
  role: cleanText(item?.role, 200),
})).filter((item) => item.memberName && item.role).slice(0, 20)
const cleanTests = (value) => (Array.isArray(value) ? value : []).map((item) => ({
  feature: cleanText(item?.feature, 200),
  method: cleanText(item?.method, 300),
  successCondition: cleanText(item?.successCondition, 200),
})).filter((item) => item.feature && item.method && item.successCondition).slice(0, 20)
const cleanDifficultyPlans = (value) => (Array.isArray(value) ? value : []).map((item) => ({
  difficulty: cleanText(item?.difficulty, 300),
  solution: cleanText(item?.solution, 300),
})).filter((item) => item.difficulty || item.solution).slice(0, 20)

const schemas = {
  planning: {
    type: 'object', additionalProperties: false,
    required: ['summary', 'strengths', 'questions', 'suggestions'],
    properties: {
      summary: { type: 'string', maxLength: 200 },
      strengths: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 150 } },
      questions: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 150 } },
      suggestions: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 150 } },
    },
  },
  hardware: {
    type: 'object', additionalProperties: false,
    required: ['summary', 'compatibility', 'warnings', 'checkItems'],
    properties: {
      summary: { type: 'string', maxLength: 200 },
      compatibility: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 150 } },
      warnings: { type: 'array', maxItems: 3, items: { type: 'string', maxLength: 150 } },
      checkItems: { type: 'array', maxItems: 4, items: { type: 'string', maxLength: 150 } },
    },
  },
}

const instructions = {
  planning: `당신은 고등학교 아두이노 프로젝트 수업의 기획 검토 도우미입니다. 학생의 기획안을 대신 작성하지 말고 현재 작성 내용의 구체성, 논리성, 실현 가능성을 짧게 검토하세요. 문제와 사용자, 핵심 기능의 연결, 입력-처리-출력 시나리오, 테스트 가능한 성공 기준, 기간과 역할 분담을 확인하세요. 정보가 부족하면 만들지 말고 학생이 생각할 질문을 제시하세요. 마크다운 없이 한국어 JSON만 반환하세요.`,
  hardware: `당신은 고등학교 아두이노 프로젝트의 하드웨어 구성 검토 도우미입니다. 선택한 보드와 부품 구성을 짧게 점검하세요. 핀 수와 PWM/I2C/SPI/UART, Uno 0·1번 핀, LED 저항, 모터·서보 별도 전원과 드라이버, 공통 GND, 전압 호환성과 안전을 확인하세요. 회로도와 코드를 생성하지 마세요. 정확한 모델을 모르면 데이터시트 확인을 안내하고 부품이나 라이브러리를 만들어 내지 마세요. 마크다운 없이 한국어 JSON만 반환하세요.`,
}

function normalizeProject(source, reviewType) {
  if (reviewType === 'planning') return {
    projectName: cleanText(source.projectName),
    oneLineSummary: cleanText(source.oneLineSummary),
    projectType: cleanText(source.projectType),
    ideaDescription: cleanText(source.ideaDescription),
    referenceProject: cleanText(source.referenceProject),
    differentiation: cleanText(source.differentiation),
    coreValues: cleanArray(source.coreValues),
    targetUser: cleanText(source.targetUser),
    existingSolution: cleanText(source.existingSolution),
    limitation: cleanText(source.limitation),
    selectionReason: cleanText(source.selectionReason),
    requiredFeatures: cleanArray(source.requiredFeatures),
    optionalFeatures: cleanArray(source.optionalFeatures),
    operationScenario: cleanText(source.operationScenario),
    expectedDuration: cleanText(source.expectedDuration),
    memberRoles: cleanRoles(source.memberRoles),
    schedule: cleanArray(source.schedule),
    difficultyPlans: cleanDifficultyPlans(source.difficultyPlans),
    safetyAndPreparation: cleanText(source.safetyAndPreparation),
    estimatedCost: Math.max(0, Number(source.estimatedCost) || 0),
    testPlans: cleanTests(source.testPlans),
  }
  return {
    projectName: cleanText(source.projectName),
    requiredFeatures: cleanArray(source.requiredFeatures),
    operationScenario: cleanText(source.operationScenario),
    board: cleanText(source.board, 120),
    inputParts: cleanParts(source.inputParts),
    outputParts: cleanParts(source.outputParts),
    otherParts: cleanArray(source.otherParts, 20),
    pinConditions: cleanText(source.pinConditions),
    estimatedCost: cleanText(source.estimatedCost, 120),
    safetyNotes: cleanArray(source.safetyNotes),
  }
}

function validateProject(project, reviewType) {
  if (reviewType === 'planning') {
    return project.projectName && project.projectType && project.ideaDescription && project.targetUser
      && project.requiredFeatures.length && project.operationScenario
  }
  return project.board && project.requiredFeatures.length
    && (project.inputParts.length + project.outputParts.length + project.otherParts.length > 0)
}

function normalizeResult(source, reviewType) {
  const fields = reviewType === 'planning'
    ? ['strengths', 'questions', 'suggestions']
    : ['compatibility', 'warnings', 'checkItems']
  return {
    summary: cleanText(source?.summary, 200),
    ...Object.fromEntries(fields.map((field) => [field, cleanArray(source?.[field], field === 'checkItems' ? 4 : 3).map((item) => item.slice(0, 150))])),
  }
}

function parseOutput(response) {
  if (response?.output_parsed && typeof response.output_parsed === 'object') return response.output_parsed
  const raw = String(response?.output_text ?? '').trim()
  try {
    return JSON.parse(raw)
  } catch {
    const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim()
    return JSON.parse(cleaned)
  }
}

function openAiError(error) {
  if (error?.name === 'APIConnectionTimeoutError') return [504, 'AI_REVIEW_TIMEOUT', 'AI 검토 시간이 초과되었습니다.']
  if (error?.status === 429) return [429, 'OPENAI_RATE_LIMIT', 'AI 요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요.']
  if (error?.status === 401 || error?.status === 403) return [500, 'OPENAI_AUTH_ERROR', 'OpenAI API 인증 정보를 확인해 주세요.']
  if (error instanceof SyntaxError) return [502, 'JSON_PARSE_FAILED', 'AI 응답 형식을 처리하지 못했습니다. 다시 시도해 주세요.']
  if (error?.status === 400) return [400, 'INVALID_REQUEST', '검토할 프로젝트 정보가 부족합니다.']
  return [500, 'AI_REVIEW_FAILED', 'AI 검토를 완료하지 못했습니다.']
}

export async function handler(event) {
  const startedAt = Date.now()
  if (event.httpMethod !== 'POST') return reply(405, { success: false, errorCode: 'METHOD_NOT_ALLOWED', message: '허용되지 않은 요청 방식입니다.' })
  try {
    const body = JSON.parse(event.body || '{}')
    const reviewType = body.reviewType
    console.info('[AI Review] 검토 유형:', reviewType === 'hardware' ? 'hardware' : 'planning')
    if (!['planning', 'hardware'].includes(reviewType) || !body.project || typeof body.project !== 'object') {
      console.info('[AI Review] 성공 또는 오류 code:', 'INVALID_REQUEST')
      return reply(400, { success: false, errorCode: 'INVALID_REQUEST', message: '검토할 프로젝트 정보가 부족합니다.' })
    }
    const project = normalizeProject(body.project, reviewType)
    if (!validateProject(project, reviewType)) {
      console.info('[AI Review] 성공 또는 오류 code:', 'INVALID_REQUEST')
      return reply(400, { success: false, errorCode: 'INVALID_REQUEST', message: '검토할 프로젝트 정보가 부족합니다.' })
    }
    console.info('[AI Review] 요청 검증 완료 시간:', elapsed(startedAt))
    if (!process.env.OPENAI_API_KEY) {
      console.info('[AI Review] 성공 또는 오류 code:', 'OPENAI_AUTH_ERROR')
      return reply(500, { success: false, errorCode: 'OPENAI_AUTH_ERROR', message: 'OpenAI API 인증 정보를 확인해 주세요.' })
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: OPENAI_TIMEOUT_MS })
    const response = await client.responses.create({
      model: REVIEW_MODEL,
      store: false,
      reasoning: { effort: 'low' },
      max_output_tokens: MAX_OUTPUT_TOKENS,
      instructions: instructions[reviewType],
      input: JSON.stringify(project),
      text: { format: { type: 'json_schema', name: `${reviewType}_review`, strict: true, schema: schemas[reviewType] } },
    })
    console.info('[AI Review] OpenAI 응답 수신 시간:', elapsed(startedAt))
    const review = normalizeResult(parseOutput(response), reviewType)
    console.info('[AI Review] 응답 검증 완료 시간:', elapsed(startedAt))
    console.info('[AI Review] 성공 또는 오류 code:', 'SUCCESS')
    return reply(200, { success: true, reviewType, review })
  } catch (error) {
    const [statusCode, errorCode, message] = openAiError(error)
    console.info('[AI Review] 성공 또는 오류 code:', errorCode)
    return reply(statusCode, { success: false, errorCode, message })
  }
}
