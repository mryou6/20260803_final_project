// 현재 프로젝트 상태를 학교 제출용 Microsoft Word 문서로 생성해 다운로드합니다.
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageBreak,
  PageOrientation,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'
import { normalizeProjectForOutput } from '../utils/projectOutput.js'

const NOT_WRITTEN = '작성되지 않음'
const borders = {
  top: { style: BorderStyle.SINGLE, size: 1, color: 'B8C5C0' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: 'B8C5C0' },
  left: { style: BorderStyle.SINGLE, size: 1, color: 'B8C5C0' },
  right: { style: BorderStyle.SINGLE, size: 1, color: 'B8C5C0' },
  insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: 'D8E0DD' },
  insideVertical: { style: BorderStyle.SINGLE, size: 1, color: 'D8E0DD' },
}

export function safeText(value, fallback = NOT_WRITTEN) {
  if (value === undefined || value === null) return fallback
  if (Array.isArray(value)) {
    const text = value.map((item) => safeText(item, '')).filter(Boolean).join(', ')
    return text || fallback
  }
  if (typeof value === 'object') return fallback
  const text = String(value).trim()
  return !text || /^[,\s]+$/.test(text) || ['undefined', 'null', '[object Object]'].includes(text)
    ? fallback
    : text
}

export function safeArray(value) {
  if (Array.isArray(value)) {
    return value.map((item) => safeText(item, '')).filter(Boolean)
  }
  const text = safeText(value, '')
  return text ? text.split(/\r?\n|,\s*/).map((item) => item.trim()).filter(Boolean) : []
}

export function formatDate(value) {
  if (!value) return NOT_WRITTEN
  const date = typeof value?.toDate === 'function'
    ? value.toDate()
    : value instanceof Date
      ? value
      : new Date(value)
  if (Number.isNaN(date.getTime())) return NOT_WRITTEN
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

export function formatCurrency(value) {
  const text = safeText(value, '')
  if (!text) return NOT_WRITTEN
  const number = Number(text.replace(/[^\d.-]/g, ''))
  return Number.isFinite(number) ? `${number.toLocaleString('ko-KR')}원` : text
}

export function sanitizeFileName(value) {
  return safeText(value, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
}

const formatGrade = (value) => {
  const text = safeText(value, '')
  return text ? (text.endsWith('학년') ? text : `${text}학년`) : ''
}

const formatClassName = (value) => {
  const text = safeText(value, '')
  return text ? (text.endsWith('반') ? text : `${text}반`) : ''
}

const cellParagraph = (text, bold = false) =>
  new Paragraph({ children: [new TextRun({ text: safeText(text), bold, size: 20 })] })

export function createLabelValueTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: rows.map(([label, value]) =>
      new TableRow({
        children: [
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            children: [cellParagraph(label, true)],
            shading: { fill: 'EAF4F0' },
          }),
          new TableCell({
            width: { size: 72, type: WidthType.PERCENTAGE },
            children: [cellParagraph(value)],
          }),
        ],
      }),
    ),
  })
}

export function createBulletList(items) {
  const values = safeArray(items)
  return values.length
    ? values.map((item) => new Paragraph({
        bullet: { level: 0 },
        spacing: { after: 80 },
        children: [new TextRun({ text: item, size: 21 })],
      }))
    : [new Paragraph({ children: [new TextRun({ text: NOT_WRITTEN, color: '777777', size: 21 })] })]
}

export function createSectionTitle(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 260, after: 180 },
    children: [new TextRun({ text, bold: true, color: '155E4B', size: 30 })],
  })
}

const createSubsection = (label, value) => [
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 160, after: 70 },
    children: [new TextRun({ text: label, bold: true, color: '243B35', size: 24 })],
  }),
  new Paragraph({
    spacing: { after: 130 },
    children: [new TextRun({ text: safeText(value), size: 21 })],
  }),
]

function createGenericTable(headers, rows, widths) {
  const header = new TableRow({
    tableHeader: true,
    children: headers.map((title, index) =>
      new TableCell({
        width: { size: widths[index], type: WidthType.PERCENTAGE },
        shading: { fill: 'DCEFE8' },
        children: [cellParagraph(title, true)],
      }),
    ),
  })
  const body = rows.length ? rows : [headers.map(() => NOT_WRITTEN)]
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders,
    rows: [
      header,
      ...body.map((row) => new TableRow({
        children: row.map((value, index) => new TableCell({
          width: { size: widths[index], type: WidthType.PERCENTAGE },
          children: [cellParagraph(value)],
        })),
      })),
    ],
  })
}

function parseStructuredRows(value, columnCount) {
  return safeArray(value).map((line) => {
    if (line && typeof line === 'object') {
      const fields = columnCount === 3 ? ['member', 'role', 'tasks'] : ['period', 'goal', 'activities', 'completion']
      return fields.map((field) => safeText(line[field]))
    }
    const columns = line.split(/\s*(?:\||→|->| - |:)\s*/).filter(Boolean)
    return Array.from({ length: columnCount }, (_, index) => safeText(columns[index], index ? NOT_WRITTEN : line))
  })
}

function createHardwareRows(hardware = {}) {
  const normalizePart = (part, category) => [
    category,
    safeText(part?.name ?? part),
    safeText(part?.quantity, '1'),
    safeText(part?.role),
    ({ owned: '보유', purchase: '구매 필요', check: '확인 필요' }[part?.availability])
      || (part?.owned === true ? '보유' : part?.owned === false ? '구매 필요' : NOT_WRITTEN),
  ]
  if (Array.isArray(hardware.parts)) {
    return hardware.parts.filter((part) => part.isActive !== false).map((part) => normalizePart(part, ({ input: '입력', output: '출력', other: '기타' }[part.category] ?? '기타')))
  }
  const rows = [
    ...(hardware.inputParts ?? []).map((part) => normalizePart(part, '입력 부품')),
    ...(hardware.outputParts ?? []).map((part) => normalizePart(part, '출력 부품')),
  ]
  safeArray(hardware.otherParts).forEach((part) => rows.push(['기타 부품', part, '1', NOT_WRITTEN, NOT_WRITTEN]))
  return rows
}

function hasAiRecord(ai = {}) {
  if (ai.planningReview?.result || ai.hardwareReview?.result) return true
  return Object.entries(ai).some(([key, value]) =>
    key === 'callCount' ? Number(value) > 0 : Array.isArray(value) ? value.length > 0 : Boolean(safeText(value, '')),
  )
}

const formatNamedItems = (items, detailKey = 'description') => (Array.isArray(items) ? items : [])
  .map((item) => `${safeText(item?.title, '')}${item?.[detailKey] ? `: ${safeText(item[detailKey], '')}` : ''}`)
  .filter(Boolean)

function createAiReviewSections(ai = {}) {
  if (ai.planningReview?.result || ai.hardwareReview?.result) {
    const sections = []
    const planning = ai.planningReview
    const hardware = ai.hardwareReview
    if (planning?.result) {
      sections.push(
        ...createSubsection('기획 내용 검토 총평', planning.result.summary),
        ...createSubsection('잘된 점', planning.result.strengths),
        ...createSubsection('추가 질문', planning.result.questions),
        ...createSubsection('개선 방향', planning.result.suggestions),
        ...createSubsection('기획 내용 검토 날짜', formatDate(planning.reviewedAt)),
      )
    }
    if (hardware?.result) {
      sections.push(
        ...createSubsection('하드웨어 검토 총평', hardware.result.summary),
        ...createSubsection('호환성 점검', hardware.result.compatibility),
        ...createSubsection('주의 사항', hardware.result.warnings),
        ...createSubsection('제작 전 확인 항목', hardware.result.checkItems),
        ...createSubsection('하드웨어 검토 날짜', formatDate(hardware.reviewedAt)),
      )
    }
    return sections
  }
  const review = ai.latestReview ?? {}
  const completeness = review.completeness ?? {}
  const feasibility = review.feasibility ?? {}
  const answers = (ai.studentAnswers ?? []).map((item) => `${safeText(item.question, '질문')} / 답변: ${safeText(item.answer)}`)
  const warnings = (review.warnings ?? ai.warnings ?? []).map((item) =>
    `[${safeText(item.severity, 'warning')}] ${safeText(item.title)}: ${safeText(item.description)} / 확인 권고: ${safeText(item.recommendation)}`)
  const decisions = (items) => (items ?? []).map((item) =>
    `${safeText(item.title)}${item.reason ? ` / 이유: ${safeText(item.reason)}` : ''}`)

  return [
    ...createSubsection('AI 검토 총평', review.summary),
    ...createSubsection('기획안 완성도', `${Number(completeness.score) || 0}점 (${safeText(completeness.level, '보완 필요')})\n보완 항목: ${safeArray(completeness.missingItems).join(', ') || '없음'}`),
    ...createSubsection('잘된 점', formatNamedItems(review.strengths)),
    ...createSubsection('기술적 실현 가능성', `${safeText(feasibility.level, '검토 필요')}: ${safeText(feasibility.description)}\n보드: ${safeText(feasibility.boardReview)}\n부품: ${safeText(feasibility.partsReview)}\n기간: ${safeText(feasibility.timeReview)}`),
    ...createSubsection('추가 질문과 학생 답변', answers.length ? answers : safeArray(review.followUpQuestions).map((item) => safeText(item.question))),
    ...createSubsection('기술·안전 경고', warnings),
    ...createSubsection('반영한 제안', decisions(ai.reflectedSuggestions)),
    ...createSubsection('일부 반영한 제안과 이유', decisions(ai.partiallyReflectedSuggestions)),
    ...createSubsection('반영하지 않은 제안과 이유', decisions(ai.rejectedSuggestions)),
    ...createSubsection('AI 검토 횟수', `${Number(ai.callCount) || 0}회`),
    ...createSubsection('마지막 AI 검토 날짜', formatDate(ai.lastReviewedAt)),
  ]
}

const teacherChecklistLabels = {
  problemDefinition: '문제 상황과 대상 사용자',
  goalAndCriteria: '프로젝트 목표와 성공 기준',
  hardwareFeasibility: '보드와 부품 구현 가능성',
  scheduleFeasibility: '제작 일정 현실성',
  safetyReview: '안전 유의사항',
  roleDistribution: '역할 분담',
}
const projectStatusLabels = {
  draft: '작성 중',
  submitted: '검토 대기',
  revision_requested: '수정 요청',
  resubmitted: '재검토 대기',
  approved: '승인 완료',
}

function createTeacherReviewSections(projectData) {
  const review = projectData.teacherReview ?? {}
  const history = Array.isArray(projectData.reviewHistory) ? [...projectData.reviewHistory].reverse() : []
  if (!review.status && !history.length) return []
  const checklist = Object.entries(teacherChecklistLabels)
    .map(([key, label]) => `${review.checklist?.[key] === true ? '☑' : '☐'} ${label}`)
  const historyLines = history.map((item) =>
    `${item?.action === 'approved' ? '승인 완료' : '수정 요청'} · ${safeText(item?.reviewerName, '교사')} · ${formatDate(item?.reviewedAt)}\n${safeText(item?.feedback)}`)
  return [
    createSectionTitle(projectData.status === 'approved' ? '6. 교사 검토 및 승인 정보' : '6. 교사 검토 결과'),
    createLabelValueTable([
      ['현재 검토 상태', projectStatusLabels[projectData.status || review.status] ?? safeText(projectData.status || review.status)],
      ['최근 교사 피드백', review.feedback],
      ['교사 확인 체크리스트', checklist],
      ['검토자', review.reviewedBy?.displayName],
      ['검토 날짜', formatDate(review.reviewedAt)],
      ...(projectData.status === 'approved' ? [
        ['담당 교사', projectData.approvedByName || review.reviewedBy?.displayName],
        ['승인 일시', formatDate(projectData.approvedAt)],
        ['최종 검토 의견', review.feedback],
      ] : []),
      ['수정 요청 횟수', `${Number(review.revisionCount) || 0}회`],
      ['검토 이력', historyLines],
    ]),
    ...(projectData.status === 'approved'
      ? [new Paragraph({
          spacing: { before: 260, after: 180 },
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '본 프로젝트 기획안은 교사의 검토를 완료하였습니다.', bold: true, color: '155E4B', size: 24 })],
        })]
      : []),
  ]
}

export function buildProjectPlanFileName(projectData) {
  const today = new Date().toISOString().slice(0, 10)
  const basic = projectData.basic ?? {}
  const parts = [
    sanitizeFileName(formatGrade(basic.grade)),
    sanitizeFileName(formatClassName(basic.className)),
    sanitizeFileName(basic.teamName),
    sanitizeFileName(basic.projectName),
    '아두이노프로젝트기획안',
    today,
  ].filter(Boolean)
  return `${parts.join('_') || `아두이노프로젝트기획안_${today}`}.docx`
}

export function createProjectPlanDocument(projectData, user = {}) {
  const basic = projectData.basic ?? {}
  const problem = projectData.intent ?? projectData.problem ?? {}
  const output = normalizeProjectForOutput(projectData)
  const ai = projectData.aiInteraction ?? {}
  const log = projectData.processLog ?? {}
  const members = (basic.members ?? []).map((member) => safeText(member?.name ?? member, '')).filter(Boolean)
  const createdAt = projectData.createdAt ?? log.startedAt
  const updatedAt = projectData.updatedAt ?? projectData.savedAt ?? log.lastSavedAt
  if (import.meta.env?.DEV) {
    console.debug('[Word Output]', {
      requiredFeatures: output.requiredFeatures,
      operationSteps: output.operationSteps,
      memberRoles: output.memberRoles,
      schedule: output.schedule,
      difficultyPlans: output.difficultyPlans,
      testPlans: output.testPlans,
    })
  }

  const cover = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1000, after: 220 }, children: [new TextRun({ text: 'Arduino Project Studio AI', bold: true, color: '155E4B', size: 44 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 600 }, children: [new TextRun({ text: '아두이노 프로젝트 기획안', bold: true, size: 52 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 260 }, children: [new TextRun({ text: safeText(basic.projectName), bold: true, size: 34 })] }),
    ...[
      ['팀명', basic.teamName],
      ['팀원', members],
      ['학년 및 반', `${formatGrade(basic.grade)} ${formatClassName(basic.className)}`],
      ['작성자', user.displayName || user.email],
      ['작성일', formatDate(new Date())],
    ].map(([label, value]) => new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [new TextRun({ text: `${label}: `, bold: true, size: 22 }), new TextRun({ text: safeText(value), size: 22 })],
    })),
    new Paragraph({ children: [new PageBreak()] }),
  ]

  const children = [
    ...cover,
    createSectionTitle('1. 프로젝트 기본 정보'),
    createLabelValueTable([
      ['학년', formatGrade(basic.grade) || NOT_WRITTEN],
      ['반', formatClassName(basic.className) || NOT_WRITTEN],
      ['팀명', basic.teamName],
      ['팀원', members],
      ['프로젝트명', basic.projectName],
      ['프로젝트 한 줄 소개', basic.summary],
      ['예상 제작 기간', basic.duration],
      ['프로젝트 유형', basic.projectType],
      ['현재 상태', projectStatusLabels[projectData.status] ?? '작성 중'],
      ['작성일', formatDate(createdAt)],
      ['최종 수정일', formatDate(updatedAt)],
    ]),
    createSectionTitle('2. 아이디어와 제작 목적'),
    ...createSubsection('무엇을 만들고 싶은가?', problem.ideaDescription),
    ...createSubsection('주제 선정 이유', problem.selectionReason),
    ...createSubsection('대상 사용자', problem.targetUser),
    ...(safeText(problem.referenceProject, '') ? createSubsection('참고하거나 응용한 작품', problem.referenceProject) : []),
    ...(safeText(problem.differentiation, '') ? createSubsection('기존 작품 또는 아이디어와의 차별점', problem.differentiation) : []),
    ...createSubsection('핵심 가치', safeArray(problem.coreValues).join(', ')),
    ...(basic.projectType === '생활 문제 해결형' ? [...createSubsection('해결하고 싶은 문제', problem.problemSituation), ...createSubsection('개선하고 싶은 내용', problem.improvementDirection)] : []),
    createSectionTitle('3. 기능 및 하드웨어 설계'),
    ...createSubsection('반드시 구현할 핵심 기능', output.requiredFeatures.join('\n')),
    ...createSubsection('추가 구현 기능', output.optionalFeatures.join('\n')),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '전체 작동 순서', bold: true, size: 24 })] }),
    ...(output.operationSteps.length
      ? output.operationSteps.map((item, index) => new Paragraph({ children: [new TextRun({ text: `${index + 1}. ${item}`, size: 21 })] }))
      : [new Paragraph(NOT_WRITTEN)]),
    ...createSubsection('사용 보드', output.board),
    createGenericTable(['구분', '부품명', '수량', '역할', '보유 여부'], createHardwareRows({ parts: output.parts }), [16, 24, 10, 32, 18]),
    ...createSubsection('핀 또는 전원 관련 주의사항', output.pinConditions),
    createSectionTitle('4. 제작 계획 및 테스트'),
    new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: '역할 분담', bold: true, size: 24 })] }),
    createGenericTable(['팀원', '담당 역할'], output.memberRoles.map((item) => [item.memberName, item.role]), [40, 60]),
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180 }, children: [new TextRun({ text: '제작 일정', bold: true, size: 24 })] }),
    createGenericTable(['차시 또는 기간', '목표'], output.schedule.map((item) => [item.period, item.goal]), [35, 65]),
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180 }, children: [new TextRun({ text: '어려움과 해결 계획', bold: true, size: 24 })] }),
    createGenericTable(['예상되는 어려움', '해결 방법'], output.difficultyPlans.map((item) => [item.difficulty, item.solution]), [45, 55]),
    ...(safeText(output.safetyAndPreparation, '') ? createSubsection('안전 및 준비 사항', output.safetyAndPreparation) : []),
    ...(output.estimatedCost !== undefined && output.estimatedCost !== null && String(output.estimatedCost).trim() !== '' ? createSubsection('예상 제작 비용', formatCurrency(output.estimatedCost)) : []),
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 180 }, children: [new TextRun({ text: '기능별 테스트 계획', bold: true, size: 24 })] }),
    createGenericTable(['확인할 기능', '확인 방법', '정상 작동 기준'], output.testPlans.map((item) => [item.feature, item.method, item.successCondition]), [30, 35, 35]),
    createSectionTitle('5. AI 검토 기록'),
    ...(hasAiRecord(ai)
      ? createAiReviewSections(ai)
      : [new Paragraph('아직 AI 검토 기록이 없습니다.')]),
    new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 220 }, children: [new TextRun({ text: '프로젝트 과정 기록', bold: true, size: 24 })] }),
    createLabelValueTable([
      ['최초 프로젝트 아이디어', log.firstProjectIdea],
      ['최종 프로젝트 아이디어', log.finalProjectIdea],
      ['방문한 단계', safeArray(log.visitedSteps).map((step) => `${step}단계`)],
      ['수정 횟수', `${Number(log.editCount) || 0}회`],
      ['AI 요청 횟수', `${Number(log.aiRequestCount) || 0}회`],
      ['마지막 저장 시각', formatDate(log.lastSavedAt)],
      ['단계별 작성 시간', Object.entries(log.stepDurations ?? {}).map(([step, ms]) => `${step}단계: ${Math.max(0, Math.round(Number(ms) / 1000))}초`)],
    ]),
    ...createTeacherReviewSections(projectData),
  ]

  return new Document({
    styles: {
      default: {
        document: { run: { size: 21, font: 'Arial' }, paragraph: { spacing: { line: 320 } } },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
          margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 },
        },
      },
      children,
    }],
  })
}

export async function downloadProjectPlanAsDocx(projectData, user = {}) {
  if (!projectData || typeof projectData !== 'object') {
    return { success: false, error: 'Word 문서를 생성할 프로젝트 정보가 없습니다.' }
  }

  try {
    const document = createProjectPlanDocument(projectData, user)
    const blob = await Packer.toBlob(document)
    const fileName = buildProjectPlanFileName(projectData)
    const url = URL.createObjectURL(blob)
    const anchor = window.document.createElement('a')
    anchor.href = url
    anchor.download = fileName
    anchor.style.display = 'none'
    window.document.body.append(anchor)
    anchor.click()
    anchor.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    return { success: true, fileName }
  } catch {
    return { success: false, error: 'Word 문서를 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.' }
  }
}
