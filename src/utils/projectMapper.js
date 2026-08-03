// 편집기 상태와 Firestore 프로젝트 문서 구조를 양방향으로 변환합니다.
import { createEmptyProject } from '../data/projectSchema.js'
import { createId } from './helpers.js'
import { normalizeProjectData } from './dataNormalizer.js'
import { getTeamRoleLabel, normalizeTeamRole } from './teamRoles.js'
import { normalizeProjectStatus } from '../constants/projectStatus.js'

const asText = (value) => typeof value === 'string' || typeof value === 'number' ? String(value) : ''
const asArray = (value) => Array.isArray(value) ? value : []
const cleanList = (value) => asArray(value).map((item) => asText(item)).filter((item) => item.trim())
const lines = (value) => asText(value).split('\n').map((item) => item.trim()).filter(Boolean)
const row = (prefix, source = {}) => ({ id: createId(prefix), ...source })
const textRows = (prefix, values) => cleanList(values).map((value) => row(prefix, { value }))
const memberNames = (value) => {
  const source = Array.isArray(value) ? value : asText(value).split(',')
  return [...new Set(source
    .flatMap((item) => typeof item === 'string' ? item.split(',') : [item?.name ?? item?.memberName ?? item?.member])
    .map((name) => asText(name).trim())
    .filter(Boolean))]
}

export function createEditorProjectState() {
  return {
    projectId: null, status: 'draft', currentStep: 1, maxVisitedStep: 1, savedAt: null,
    basic: {
      grade: '', className: '', teamName: '', authorName: '', members: [row('member', { name: '' })],
      projectName: '', summary: '', duration: '', projectType: '',
    },
    intent: {
      ideaDescription: '', selectionReason: '', targetUser: '', referenceProject: '',
      differentiation: '', coreValues: [], otherCoreValue: '',
      currentSolution: '', currentLimitation: '',
      originalCoreFeatures: '', reproductionScope: '', modificationScope: '',
      intendedExperience: '', funElement: '', userReaction: '',
    },
    features: {
      requiredFeatures: [row('feature', { value: '' })], optionalFeatures: [],
      featureHardwareLinks: [],
      operationSteps: [row('operation', { value: '' })], successCriteria: [row('criterion', { value: '' })],
    },
    hardware: {
      board: '', customBoard: '', parts: [], powerRequirements: '', driverRequirements: '',
      pinConditions: '', undecidedParts: '',
    },
    production: {
      memberRoles: [row('role', { memberId: '', member: '', roleTypes: [], roleType: '', customRole: '' })],
      schedule: [row('schedule', { period: '', goal: '' })],
      difficultyPlans: [row('difficulty', { difficulty: '', solution: '' })],
      safetyAndPreparation: '',
      expectedProblems: [row('problem', { value: '' })],
      solutions: [row('solution', { value: '' })], safetyNotes: [row('safety', { value: '' })],
      budget: '', testPlans: [row('test', { feature: '', method: '', successCondition: '' })],
      finalCompletionCriteria: [row('final', { value: '' })],
      completionCriteria: null,
      finalCriteria: null,
    },
    aiInteraction: createEmptyProject().aiInteraction,
    teacherReview: createEmptyProject().teacherReview,
    reviewHistory: [],
  }
}

const values = (rows) => asArray(rows).map((item) => asText(item?.value)).filter((item) => item.trim())
const stripIds = (rows) => asArray(rows).map(({ id, ...item }) => item)

export function toProjectDocument(state, processLog) {
  const selectedParts = asArray(state.hardware.parts).filter((part) => part.isActive !== false).map(({ id, isActive, ...part }) => ({
    ...part, quantity: Math.max(1, Number(part.quantity) || 1),
  }))
  const operationSteps = values(state.features.operationSteps)
  const successCriteria = values(state.features.successCriteria)
  const memberRoles = stripIds(state.production.memberRoles).map((item) => ({
    memberId: asText(item.memberId),
    memberName: asText(item.member),
    member: asText(item.member),
    roleTypes: asArray(item.roleTypes),
    roleType: asText(item.roleTypes?.[0] ?? item.roleType),
    customRole: asText(item.customRole),
    role: getTeamRoleLabel(item),
  })).filter((item) => item.memberName || item.roleType || item.customRole)
  const schedule = stripIds(state.production.schedule).filter((item) => item.period || item.goal || item.activities || item.completion)
  const testPlans = stripIds(state.production.testPlans).filter((item) => item.feature || item.method || item.successCondition)
  const difficultyPlans = stripIds(state.production.difficultyPlans).filter((item) => item.difficulty || item.solution)
  const safetyAndPreparation = asText(state.production.safetyAndPreparation)
  const planningData = {
    formVersion: 2,
    teamMembers: state.basic.members.map((member) => ({ id: asText(member.id), name: asText(member.name) })).filter((member) => member.name),
    projectType: state.basic.projectType,
    ideaDescription: state.intent.ideaDescription,
    selectionReason: state.intent.selectionReason,
    targetUser: state.intent.targetUser,
    referenceProject: state.intent.referenceProject,
    differentiation: state.intent.differentiation,
    coreValues: [...state.intent.coreValues, state.intent.otherCoreValue].filter(Boolean),
    existingSolution: state.intent.currentSolution,
    limitation: state.intent.currentLimitation,
    originalCoreFeatures: state.intent.originalCoreFeatures,
    reproductionScope: state.intent.reproductionScope,
    modificationScope: state.intent.modificationScope,
    intendedExperience: state.intent.intendedExperience,
    funElement: state.intent.funElement,
    userReaction: state.intent.userReaction,
    requiredFeatures: values(state.features.requiredFeatures),
    optionalFeatures: values(state.features.optionalFeatures),
    featureHardwareLinks: stripIds(state.features.featureHardwareLinks).filter((item) => Object.values(item).some((value) => asText(value).trim())),
    inputInformation: state.features.featureHardwareLinks.map((item) => item.input).filter(Boolean),
    processingLogic: state.features.featureHardwareLinks.map((item) => item.process).filter(Boolean),
    outputResults: state.features.featureHardwareLinks.map((item) => item.output).filter(Boolean),
    operationSteps,
    successCriteria: values(state.production.finalCompletionCriteria).length
      ? values(state.production.finalCompletionCriteria)
      : successCriteria,
    board: state.hardware.board,
    customBoard: state.hardware.customBoard,
    parts: selectedParts,
    powerRequirements: state.hardware.powerRequirements,
    driverRequirements: state.hardware.driverRequirements,
    pinConditions: state.hardware.pinConditions,
    undecidedParts: state.hardware.undecidedParts,
    memberRoles,
    schedule,
    difficultyPlans,
    safetyAndPreparation,
    expectedProblems: difficultyPlans.map((item) => item.difficulty).filter(Boolean),
    solutions: difficultyPlans.map((item) => item.solution).filter(Boolean),
    safetyNotes: lines(safetyAndPreparation),
    estimatedCost: String(state.production.budget ?? '').trim()
      ? Math.max(0, Number(String(state.production.budget).replace(/[^\d]/g, '')) || 0)
      : '',
    testPlans,
    finalCompletionCriteria: values(state.production.finalCompletionCriteria),
    completionCriteria: state.production.completionCriteria,
    finalCriteria: state.production.finalCriteria,
    grade: state.basic.grade,
    className: state.basic.className,
    // 구형 소비자와 이전 배포본을 위한 호환 필드
    inputDevices: state.features.featureHardwareLinks.map((item) => item.input).filter(Boolean),
    processDescription: state.features.featureHardwareLinks.map((item) => item.process).filter(Boolean).join('\n'),
    outputDevices: state.features.featureHardwareLinks.map((item) => item.output).filter(Boolean),
    operationScenario: operationSteps.join('\n'),
    pinPlan: state.hardware.pinConditions,
    powerPlan: state.hardware.powerRequirements,
    otherParts: selectedParts.filter((part) => part.isCustom).map((part) => part.name).join('\n'),
  }
  return {
    projectName: state.basic.projectName, teamName: state.basic.teamName,
    members: state.basic.members.map((member) => member.name).filter(Boolean),
    oneLineSummary: state.basic.summary, expectedDuration: state.basic.duration,
    currentStep: state.currentStep, progress: Math.round((state.currentStep / 5) * 100),
    planningData,
    aiInteraction: { ...createEmptyProject().aiInteraction, ...(state.aiInteraction ?? {}) },
    processLog: { ...createEmptyProject().processLog, ...processLog, currentStep: state.currentStep, lastSavedAt: new Date().toISOString() },
  }
}

function normalizedParts(planning) {
  const categorized = asArray(planning.parts).length
    ? planning.parts
    : [...asArray(planning.inputParts).map((part) => ({ ...part, category: 'input' })),
      ...asArray(planning.outputParts).map((part) => ({ ...part, category: 'output' }))]
  const otherParts = asArray(planning.parts).length
    ? []
    : Array.isArray(planning.otherParts) ? planning.otherParts : lines(planning.otherParts)
  const parts = [
    ...categorized,
    ...otherParts.map((part) => typeof part === 'object'
      ? { ...part, category: 'other', isCustom: true }
      : { name: part, category: 'other', isCustom: true }),
  ]
  return parts.map((part) => row('part', {
    category: part.category === 'input' ? 'input' : part.category === 'output' ? 'output' : 'other',
    name: asText(part.name), quantity: Math.max(1, Number(part.quantity) || 1), role: asText(part.role),
    availability: asText(part.availability) || (part.owned === true ? 'owned' : part.owned === false ? 'purchase' : 'check'),
    isCustom: Boolean(part.isCustom), isActive: true,
  })).filter((part) => part.name)
}

const structuredRows = (prefix, rows, fields, legacy = []) => {
  const source = asArray(rows).length ? rows : legacy
  const result = asArray(source).map((item) => {
    if (typeof item !== 'object') return row(prefix, { [fields[0]]: asText(item) })
    return row(prefix, Object.fromEntries(fields.map((field) => [field, asText(item[field])])))
  })
  return result.length ? result : [row(prefix, Object.fromEntries(fields.map((field) => [field, ''])))]
}

const roleRows = (value) => {
  const rows = asArray(value).map((item) => {
    if (typeof item === 'string') {
      const [member = '', ...roleParts] = item.split(/\s*(?:\||→|->| - |:)\s*/)
      return row('role', normalizeTeamRole({ member, role: roleParts.join(' - ') }))
    }
    return row('role', normalizeTeamRole({
      ...item,
      member: item?.member ?? item?.memberName ?? item?.name,
      role: item?.role ?? item?.task ?? item?.responsibility,
    }))
  })
  return rows.length ? rows : [row('role', { memberId: '', member: '', roleTypes: [], roleType: '', customRole: '' })]
}

export function fromProjectDocument(documentData = {}) {
  const isLegacySixStep = !documentData.planningData?.formVersion
  const originalStep = Math.max(1, Number(documentData.currentStep) || 1)
  const originalOwnerName = asText(documentData.ownerName)
  documentData = normalizeProjectData(documentData, documentData.id ?? documentData.projectId)
  const empty = createEmptyProject()
  const p = { ...empty.planningData, ...(documentData.planningData ?? {}) }
  const state = createEditorProjectState()
  const requiredFeatures = asArray(p.requiredFeatures)
  const operationSteps = asArray(p.operationSteps).length ? p.operationSteps : lines(p.operationScenario)
  const criteria = Array.isArray(p.successCriteria) ? p.successCriteria : lines(p.successCriteria)
  const legacySchedule = asArray(p.schedule).map((item) => typeof item === 'object'
    ? { period: asText(item.period), goal: asText(item.goal || item.activities || item.completion) }
    : { goal: asText(item) })
  const legacyDifficulties = asArray(p.expectedProblems)
  const legacySolutions = asArray(p.solutions)
  const difficultyPlans = asArray(p.difficultyPlans).length
    ? p.difficultyPlans
    : Array.from({ length: Math.max(legacyDifficulties.length, legacySolutions.length, 1) }, (_, index) => ({
        difficulty: asText(legacyDifficulties[index]),
        solution: asText(legacySolutions[index]),
      }))
  const mappedStep = isLegacySixStep ? (originalStep >= 6 ? 5 : originalStep >= 4 ? originalStep - 1 : originalStep) : originalStep
  const legacyInputs = asArray(p.inputInformation).length ? p.inputInformation : p.inputDevices
  const legacyProcesses = asArray(p.processingLogic).length ? p.processingLogic : lines(p.processDescription)
  const legacyOutputs = asArray(p.outputResults).length ? p.outputResults : p.outputDevices
  const legacyLink = {
    feature: asText(requiredFeatures[0]),
    input: cleanList(legacyInputs).join(', '),
    process: cleanList(legacyProcesses).join(', '),
    output: cleanList(legacyOutputs).join(', '),
    parts: normalizedParts(p).map((part) => part.name).join(', '),
  }
  return {
    ...state, projectId: documentData.id ?? documentData.projectId ?? null,
    status: normalizeProjectStatus(documentData.status),
    revisionInProgress: documentData.revisionInProgress === true,
    revisionStartedAt: documentData.revisionStartedAt ?? null,
    resubmittedAt: documentData.resubmittedAt ?? null,
    approvedAt: documentData.approvedAt ?? null,
    approvedBy: asText(documentData.approvedBy),
    approvedByName: asText(documentData.approvedByName),
    currentStep: Math.min(5, mappedStep),
    maxVisitedStep: Math.min(5, mappedStep),
    savedAt: timestampToIso(documentData.updatedAt),
    basic: {
      ...state.basic, grade: asText(p.grade), className: asText(p.className), teamName: asText(documentData.teamName),
      authorName: originalOwnerName,
      members: asArray(p.teamMembers).length
        ? p.teamMembers.map((member) => ({ id: asText(member.id) || createId('member'), name: asText(member.name) })).filter((member) => member.name)
        : memberNames(documentData.members).length ? memberNames(documentData.members).map((name) => row('member', { name })) : state.basic.members,
      projectName: asText(documentData.projectName), summary: asText(documentData.oneLineSummary),
      duration: asText(documentData.expectedDuration), projectType: asText(p.projectType),
    },
    intent: {
      ...state.intent, ideaDescription: asText(p.ideaDescription || documentData.oneLineSummary),
      selectionReason: asText(p.selectionReason), targetUser: asText(p.targetUser),
      referenceProject: asText(p.referenceProject), differentiation: asText(p.differentiation),
      coreValues: asArray(p.coreValues).filter((value) => value !== '기타'),
      currentSolution: asText(p.existingSolution), currentLimitation: asText(p.limitation),
      originalCoreFeatures: asText(p.originalCoreFeatures),
      reproductionScope: asText(p.reproductionScope), modificationScope: asText(p.modificationScope),
      intendedExperience: asText(p.intendedExperience), funElement: asText(p.funElement), userReaction: asText(p.userReaction),
    },
    features: {
      requiredFeatures: textRows('feature', requiredFeatures).length ? textRows('feature', requiredFeatures) : state.features.requiredFeatures,
      optionalFeatures: textRows('optional', p.optionalFeatures),
      featureHardwareLinks: asArray(p.featureHardwareLinks).length
        ? structuredRows('link', p.featureHardwareLinks, ['feature', 'input', 'process', 'output', 'parts'])
        : [row('link', legacyLink)],
      operationSteps: textRows('operation', operationSteps).length ? textRows('operation', operationSteps) : state.features.operationSteps,
      successCriteria: textRows('criterion', criteria).length ? textRows('criterion', criteria) : state.features.successCriteria,
    },
    hardware: {
      board: asText(p.board), customBoard: asText(p.customBoard), parts: normalizedParts(p),
      powerRequirements: asText(p.powerRequirements || p.powerPlan), driverRequirements: asText(p.driverRequirements),
      pinConditions: asText(p.pinConditions || p.pinPlan), undecidedParts: asText(p.undecidedParts),
    },
    production: {
      memberRoles: roleRows(p.memberRoles),
      schedule: structuredRows('schedule', p.schedule, ['period', 'goal'], legacySchedule),
      difficultyPlans: structuredRows('difficulty', difficultyPlans, ['difficulty', 'solution']),
      safetyAndPreparation: asText(p.safetyAndPreparation) || cleanList(p.safetyNotes).join('\n'),
      expectedProblems: textRows('problem', p.expectedProblems).length ? textRows('problem', p.expectedProblems) : state.production.expectedProblems,
      solutions: textRows('solution', p.solutions).length ? textRows('solution', p.solutions) : state.production.solutions,
      safetyNotes: textRows('safety', p.safetyNotes).length ? textRows('safety', p.safetyNotes) : state.production.safetyNotes,
      budget: asText(p.estimatedCost),
      testPlans: structuredRows('test', p.testPlans, ['feature', 'method', 'successCondition']),
      finalCompletionCriteria: textRows('final', asArray(p.finalCompletionCriteria).length
        ? p.finalCompletionCriteria
        : (Array.isArray(p.successCriteria) ? p.successCriteria : lines(p.successCriteria))).length
        ? textRows('final', asArray(p.finalCompletionCriteria).length
          ? p.finalCompletionCriteria
          : (Array.isArray(p.successCriteria) ? p.successCriteria : lines(p.successCriteria)))
        : state.production.finalCompletionCriteria,
      completionCriteria: p.completionCriteria ?? null,
      finalCriteria: p.finalCriteria ?? null,
    },
    aiInteraction: { ...empty.aiInteraction, ...(documentData.aiInteraction ?? {}) },
    teacherReview: {
      ...empty.teacherReview,
      ...(documentData.teacherReview ?? {}),
      status: documentData.teacherReview?.status ?? documentData.status,
      feedback: documentData.teacherReview?.feedback ?? documentData.feedback ?? '',
      checklist: { ...empty.teacherReview.checklist, ...(documentData.teacherReview?.checklist ?? documentData.checklist ?? {}) },
      requestedBy: documentData.teacherReview?.requestedBy ?? documentData.requestedBy ?? documentData.revisionRequestedBy ?? '',
      requestedByName: documentData.teacherReview?.requestedByName ?? documentData.requestedByName ?? documentData.revisionRequestedByName ?? '',
      requestedAt: documentData.teacherReview?.requestedAt ?? documentData.requestedAt ?? documentData.revisionRequestedAt ?? null,
      studentRead: documentData.teacherReview?.studentRead ?? documentData.studentRead ?? false,
      studentReadAt: documentData.teacherReview?.studentReadAt ?? documentData.studentReadAt ?? null,
      reviewedBy: { ...empty.teacherReview.reviewedBy, ...(documentData.teacherReview?.reviewedBy ?? documentData.reviewedBy ?? {}) },
      reviewedAt: documentData.teacherReview?.reviewedAt ?? documentData.reviewedAt ?? null,
      revisionCount: documentData.teacherReview?.revisionCount ?? documentData.revisionCount ?? 0,
      notification: { ...empty.teacherReview.notification, ...(documentData.teacherReview?.notification ?? {}) },
    },
    reviewHistory: asArray(documentData.reviewHistory),
  }
}

export function timestampToIso(value) {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate().toISOString()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
