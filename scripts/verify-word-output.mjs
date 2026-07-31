import assert from 'node:assert/strict'
import { Packer } from 'docx'
import JSZip from 'jszip'
import { createProjectPlanDocument } from '../src/services/documentService.js'
import { normalizeProjectForOutput } from '../src/utils/projectOutput.js'

const currentState = {
  basic: {
    grade: '2',
    className: '3',
    teamName: '코딩별',
    members: [{ name: '민준' }, { name: '서연' }, { name: '지우' }],
    projectName: '스마트 화분',
    summary: '식물 상태를 알려 주는 화분',
    duration: '6차시',
    projectType: '생활 문제 해결형',
  },
  intent: {
    ideaDescription: '토양 상태를 확인한다.',
    selectionReason: '물을 놓치는 문제를 줄인다.',
    targetUser: '교실 학생',
    coreValues: ['편리함'],
  },
  features: {
    requiredFeatures: [{ id: 'r1', value: '토양 수분 측정' }, { id: 'r2', value: '건조 상태 알림' }],
    optionalFeatures: [{ id: 'o1', value: 'LCD 상태 표시' }],
    operationSteps: [{ id: 's1', value: '센서 값을 읽는다' }, { id: 's2', value: '기준값과 비교한다' }, { id: 's3', value: 'LED와 LCD에 표시한다' }],
  },
  hardware: {
    board: 'Arduino Uno',
    parts: [{ category: 'input', name: '토양 수분 센서', quantity: 1, role: '수분 측정', availability: 'owned' }],
    pinConditions: '센서는 A0 핀에 연결',
  },
  production: {
    memberRoles: [
      { memberName: '민준', roleTypes: ['circuit', 'code'] },
      { memberName: '서연', roleTypes: ['report', 'presentation'] },
      { memberName: '지우', roleTypes: ['exterior', 'testing'] },
    ],
    schedule: Array.from({ length: 6 }, (_, index) => ({ period: `${index + 1}차시`, goal: `${index + 1}차시 제작 목표` })),
    difficultyPlans: [{ difficulty: 'LCD 글자가 보이지 않을 수 있음', solution: 'I2C 주소와 배선을 확인' }],
    safetyAndPreparation: '전원을 끄고 배선한다.',
    budget: 10000,
    testPlans: [{ feature: '건조 알림', method: '마른 흙에 센서를 넣는다', successCondition: '빨간 LED가 켜진다' }],
  },
}

const output = normalizeProjectForOutput(currentState)
assert.deepEqual(output.requiredFeatures, ['토양 수분 측정', '건조 상태 알림'])
assert.equal(output.memberRoles.length, 3)
assert.equal(output.schedule.length, 6)
assert.match(output.memberRoles[0].role, /회로/)
assert.match(output.memberRoles[0].role, /코드/)

const savedDocument = {
  planningData: {
    requiredFeatures: currentState.features.requiredFeatures,
    optionalFeatures: currentState.features.optionalFeatures,
    operationSteps: currentState.features.operationSteps,
    board: currentState.hardware.board,
    parts: currentState.hardware.parts,
    pinConditions: currentState.hardware.pinConditions,
    memberRoles: currentState.production.memberRoles,
    schedule: currentState.production.schedule,
    difficultyPlans: currentState.production.difficultyPlans,
    safetyAndPreparation: currentState.production.safetyAndPreparation,
    estimatedCost: currentState.production.budget,
    testPlans: currentState.production.testPlans,
  },
}
assert.deepEqual(normalizeProjectForOutput(savedDocument).requiredFeatures, output.requiredFeatures)
assert.equal(normalizeProjectForOutput(savedDocument).schedule.length, 6)

const legacyDocument = {
  planningData: {
    requiredFeatures: ['온도 측정'],
    optionalFeatures: ['소리 알림'],
    operationScenario: '센서를 읽는다\n부저를 울린다',
    memberRoles: [{ member: '하늘', role: '코딩' }],
    schedule: [{ session: '1차시', objective: '회로 구성' }],
    expectedProblems: ['센서 오차'],
    solutions: ['평균값 사용'],
    safetyNotes: ['합선을 확인한다'],
    testPlans: [{ targetFeature: '경보', testMethod: '고온 환경 구성', expectedResult: '부저 작동' }],
  },
}
const legacyOutput = normalizeProjectForOutput(legacyDocument)
assert.deepEqual(legacyOutput.operationSteps, ['센서를 읽는다', '부저를 울린다'])
assert.deepEqual(legacyOutput.difficultyPlans, [{ difficulty: '센서 오차', solution: '평균값 사용' }])
assert.equal(legacyOutput.testPlans[0].successCondition, '부저 작동')

const document = createProjectPlanDocument(currentState, { displayName: '검증 학생' })
const buffer = await Packer.toBuffer(document)
assert.equal(buffer.subarray(0, 2).toString(), 'PK')
const zip = await JSZip.loadAsync(buffer)
const xml = await zip.file('word/document.xml').async('string')
for (const expected of [
  '토양 수분 측정', '건조 상태 알림', 'LCD 상태 표시',
  '센서 값을 읽는다', 'LED와 LCD에 표시한다',
  '민준', '회로 구현', '코드 작성',
  '1차시 제작 목표', '6차시 제작 목표',
  'LCD 글자가 보이지 않을 수 있음', 'I2C 주소와 배선을 확인',
  '전원을 끄고 배선한다.', '10,000원',
  '건조 알림', '마른 흙에 센서를 넣는다', '빨간 LED가 켜진다',
]) {
  assert.ok(xml.includes(expected), `DOCX에서 누락됨: ${expected}`)
}
assert.ok(!xml.includes('[object Object]'), 'DOCX에 객체 문자열이 노출됨')
console.log(`Word 출력 검증 성공: ${buffer.length} bytes, 최신/저장/이전 형식 통과`)
