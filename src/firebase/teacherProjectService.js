import { collection, doc, getDoc, getDocs, onSnapshot, orderBy, query, runTransaction } from 'firebase/firestore'
import { db } from './firebaseConfig.js'
import { cleanNumber, cleanText, normalizeProjectData } from '../utils/dataNormalizer.js'

const text = cleanText
const array = (value) => (Array.isArray(value) ? value : [])
const number = cleanNumber
const detailDevLog = (label, value) => {
  if (import.meta.env?.DEV) console.info(`[Teacher Detail] ${label}`, value)
}
const errorResult = (error, fallback) => ({
  success: false,
  errorCode: error?.code === 'permission-denied' ? 'permission-denied' : 'project-read-failed',
  error: error?.code === 'permission-denied'
    ? '교사 권한 또는 Firestore 보안 규칙을 확인해 주세요.'
    : fallback,
})

export function normalizeTeacherProject(data = {}, id = '') {
  const project = normalizeProjectData(data, id)
  const planningData = project.planningData
  const aiInteraction = project.aiInteraction
  const grade = text(planningData.grade)
  const className = text(planningData.className)
  return {
    ...project,
    grade,
    className,
    classroomKey: grade || className ? `${grade}|${className}` : '',
    board: text(planningData.board),
    aiCallCount: Math.max(0, Math.round(number(aiInteraction.callCount, 0))),
  }
}

export async function getAllProjectsForTeacher() {
  if (!db) return { success: false, errorCode: 'firebase-unavailable', error: 'Firebase 연결 정보를 확인해 주세요.' }
  try {
    const snapshot = await getDocs(query(collection(db, 'projects'), orderBy('updatedAt', 'desc')))
    return { success: true, projects: snapshot.docs.map((item) => normalizeTeacherProject(item.data(), item.id)) }
  } catch (error) {
    try {
      const snapshot = await getDocs(collection(db, 'projects'))
      const projects = snapshot.docs.map((item) => normalizeTeacherProject(item.data(), item.id))
        .sort((a, b) => (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
      return { success: true, projects }
    } catch (fallbackError) {
      return errorResult(fallbackError?.code ? fallbackError : error, '학생 프로젝트를 불러오지 못했습니다.')
    }
  }
}

export function subscribeAllProjectsForTeacher(onProjects, onError) {
  if (!db) return () => {}
  return onSnapshot(
    query(collection(db, 'projects'), orderBy('updatedAt', 'desc')),
    (snapshot) => onProjects(snapshot.docs.map((item) => normalizeTeacherProject(item.data(), item.id))),
    (error) => onError?.(errorResult(error, '학생 프로젝트 실시간 업데이트를 불러오지 못했습니다.')),
  )
}

export async function getProjectDetailForTeacher(projectId, currentUser) {
  if (!db || !projectId || !currentUser?.uid) return { success: false, error: '로그인과 프로젝트 정보를 확인해 주세요.' }
  detailDevLog('currentUser.uid', currentUser.uid)
  detailDevLog('projectId', projectId)
  let teacherDocumentExists = '확인 실패'
  try {
    const teacherSnapshot = await getDoc(doc(db, 'teachers', currentUser.uid))
    teacherDocumentExists = teacherSnapshot.exists()
    detailDevLog('교사 문서 존재 여부', teacherDocumentExists)
    if (!teacherSnapshot.exists() || teacherSnapshot.data()?.active !== true) {
      detailDevLog('Firestore error code', 'permission-denied')
      detailDevLog('error message', '활성화된 UID 기반 교사 문서를 확인할 수 없습니다.')
      return {
        success: false,
        errorCode: 'permission-denied',
        error: '교사 권한 또는 Firestore 보안 규칙을 확인해 주세요.',
      }
    }
    const snapshot = await getDoc(doc(db, 'projects', projectId))
    if (!snapshot.exists()) return { success: false, errorCode: 'not-found', error: '프로젝트를 찾을 수 없습니다.' }
    const historySnapshot = await getDocs(collection(db, 'projects', projectId, 'reviewHistory'))
    const data = snapshot.data()
    const externalHistory = historySnapshot.docs
      .map((item) => item.data())
      .filter((item) => ['resubmitted', 'approved'].includes(item.action))
    return {
      success: true,
      project: normalizeTeacherProject({
        ...data,
        reviewHistory: [...array(data.reviewHistory), ...externalHistory],
      }, snapshot.id),
    }
  } catch (error) {
    detailDevLog('교사 문서 존재 여부', teacherDocumentExists)
    detailDevLog('Firestore error code', error?.code ?? 'unknown')
    detailDevLog('error message', error?.message ?? '')
    return errorResult(error, '프로젝트 상세 정보를 불러오지 못했습니다.')
  }
}

export function getTeacherDashboardStats(projects = []) {
  const items = Array.isArray(projects) ? projects : []
  const count = (status) => items.filter((project) => project.status === status).length
  return {
    total: items.length,
    draft: count('draft'),
    submitted: count('submitted'),
    returned: count('revision_requested'),
    approved: count('approved'),
    averageProgress: items.length ? Math.round(items.reduce((sum, project) => sum + number(project.progress), 0) / items.length) : 0,
    aiCallCount: items.reduce((sum, project) => sum + Math.max(0, number(project.aiCallCount)), 0),
    recentSubmissionCount: items.filter((project) =>
      project.submittedAt && Date.now() - project.submittedAt.getTime() <= 7 * 86400000).length,
    unreadFeedbackCount: items.filter((project) =>
      project.status === 'revision_requested' && project.teacherReview?.studentRead !== true).length,
    readFeedbackCount: items.filter((project) =>
      project.status === 'revision_requested' && project.teacherReview?.studentRead === true).length,
  }
}

const deleteErrorMessages = {
  'permission-denied': 'Firestore 보안 규칙으로 인해 프로젝트를 삭제할 수 없습니다.',
  unauthenticated: '로그인 상태가 만료되었습니다. 다시 로그인해 주세요.',
  'not-found': '삭제하려는 프로젝트를 찾지 못했습니다.',
  unavailable: 'Firestore 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  'failed-precondition': '현재 상태에서는 프로젝트를 삭제할 수 없습니다.',
}

export function normalizeFirebaseErrorCode(code) {
  return String(code ?? '').trim().toLowerCase().replace(/^firestore\//, '')
}

export function getTeacherDeleteErrorMessage(code) {
  return deleteErrorMessages[normalizeFirebaseErrorCode(code)] ?? '선택한 프로젝트를 삭제하지 못했습니다.'
}

export async function deleteProjectsForTeacher(projectIds, teacherUser) {
  if (!db || !teacherUser?.uid) {
    return { success: false, deletedCount: 0, failedCount: 0, failedProjectIds: [], message: '교사 로그인 정보를 확인해 주세요.' }
  }
  const ids = [...new Set((Array.isArray(projectIds) ? projectIds : []).map((id) => text(id)).filter(Boolean))]
  if (!ids.length) {
    return { success: false, deletedCount: 0, failedCount: 0, failedProjectIds: [], message: '삭제할 프로젝트를 선택해 주세요.' }
  }
  console.info('[Teacher Delete] 삭제 시작')
  console.info('[Teacher Delete] 선택 문서 수:', ids.length)
  try {
    const userSnapshot = await getDoc(doc(db, 'teachers', teacherUser.uid))
    if (!userSnapshot.exists() || userSnapshot.data()?.active !== true) {
      console.info('[Teacher Delete] Firebase 오류 code:', 'permission-denied')
      console.info('[Teacher Delete] 삭제 성공 수:', 0)
      console.info('[Teacher Delete] 삭제 실패 수:', ids.length)
      return {
        success: false,
        deletedCount: 0,
        failedCount: ids.length,
        failedProjectIds: ids,
        errorCode: 'permission-denied',
        message: getTeacherDeleteErrorMessage('permission-denied'),
      }
    }
  } catch (error) {
    const errorCode = normalizeFirebaseErrorCode(error?.code)
    console.info('[Teacher Delete] Firebase 오류 code:', errorCode || 'unknown')
    console.info('[Teacher Delete] 삭제 성공 수:', 0)
    console.info('[Teacher Delete] 삭제 실패 수:', ids.length)
    return {
      success: false, deletedCount: 0, failedCount: ids.length, failedProjectIds: ids,
      errorCode,
      message: getTeacherDeleteErrorMessage(errorCode),
    }
  }

  const results = []
  for (const projectId of ids) {
    try {
      const deleted = await runTransaction(db, async (transaction) => {
        const projectRef = doc(db, 'projects', projectId)
        const snapshot = await transaction.get(projectRef)
        if (!snapshot.exists()) return { deleted: false, errorCode: 'not-found' }
        transaction.delete(projectRef)
        return { deleted: true, errorCode: '' }
      })
      results.push({ projectId, ...deleted })
    } catch (error) {
      const errorCode = normalizeFirebaseErrorCode(error?.code)
      results.push({ projectId, deleted: false, errorCode })
    }
  }
  const failedProjectIds = results.filter((result) => !result.deleted).map((result) => result.projectId)
  const deletedCount = results.length - failedProjectIds.length
  const failedCount = failedProjectIds.length
  const firstFailureCode = results.find((result) => !result.deleted)?.errorCode ?? ''
  if (failedCount) console.info('[Teacher Delete] Firebase 오류 code:', firstFailureCode || 'unknown')
  console.info('[Teacher Delete] 삭제 성공 수:', deletedCount)
  console.info('[Teacher Delete] 삭제 실패 수:', failedCount)
  return {
    success: failedCount === 0,
    deletedCount,
    failedCount,
    failedProjectIds,
    errorCode: firstFailureCode,
    message: deletedCount && failedCount
      ? `${deletedCount}개 프로젝트를 삭제했고, ${failedCount}개는 삭제하지 못했습니다.`
      : deletedCount
        ? `선택한 프로젝트 ${deletedCount}개를 삭제했습니다.`
        : getTeacherDeleteErrorMessage(firstFailureCode),
  }
}
