// 학생의 기획안 작성 과정을 브라우저 메모리에서만 기록합니다.
const createInitialLog = () => ({
  startedAt: null,
  lastSavedAt: null,
  currentStep: 1,
  visitedSteps: [],
  stepDurations: {},
  editCount: 0,
  aiRequestCount: 0,
  firstProjectIdea: '',
  finalProjectIdea: '',
})

let processLog = createInitialLog()
const activeTimers = new Map()

export function startSession() {
  processLog = {
    ...createInitialLog(),
    startedAt: new Date().toISOString(),
  }
  activeTimers.clear()
  return getProcessLog()
}

export function recordStepVisit(stepNumber) {
  processLog.currentStep = stepNumber
  if (!processLog.visitedSteps.includes(stepNumber)) {
    processLog.visitedSteps.push(stepNumber)
  }
  return getProcessLog()
}

export function startStepTimer(stepNumber) {
  if (!activeTimers.has(stepNumber)) {
    activeTimers.set(stepNumber, performance.now())
  }
}

export function endStepTimer(stepNumber) {
  const startedAt = activeTimers.get(stepNumber)
  if (startedAt === undefined) return

  const elapsedMilliseconds = Math.max(0, Math.round(performance.now() - startedAt))
  processLog.stepDurations[stepNumber] = (processLog.stepDurations[stepNumber] ?? 0) + elapsedMilliseconds
  activeTimers.delete(stepNumber)
}

export function recordEdit() {
  processLog.editCount += 1
}

export function recordAiRequest() {
  processLog.aiRequestCount += 1
}

export function setFirstProjectIdea(text) {
  if (!processLog.firstProjectIdea) {
    processLog.firstProjectIdea = String(text ?? '')
  }
}

export function setFinalProjectIdea(text) {
  processLog.finalProjectIdea = String(text ?? '')
}

export function getProcessLog() {
  return structuredClone(processLog)
}

export function restoreProcessLog(savedLog = {}) {
  const normalizeDate = (value) => {
    if (!value) return null
    if (typeof value?.toDate === 'function') return value.toDate().toISOString()
    if (typeof value === 'string') return value
    const date = value instanceof Date ? value : new Date(value)
    return Number.isNaN(date.getTime()) ? null : date.toISOString()
  }
  processLog = {
    ...createInitialLog(),
    ...savedLog,
    startedAt: normalizeDate(savedLog.startedAt),
    lastSavedAt: normalizeDate(savedLog.lastSavedAt),
    visitedSteps: Array.isArray(savedLog.visitedSteps) ? savedLog.visitedSteps : [],
    stepDurations: savedLog.stepDurations && typeof savedLog.stepDurations === 'object'
      ? savedLog.stepDurations
      : {},
  }
  activeTimers.clear()
  return getProcessLog()
}

export function recordSavedAt() {
  processLog.lastSavedAt = new Date().toISOString()
  return processLog.lastSavedAt
}
