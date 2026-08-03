import { collection, doc, runTransaction, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { auth, db } from './firebaseConfig.js'
import { normalizeProjectStatus, PROJECT_STATUS } from '../constants/projectStatus.js'

export const reviewChecklistLabels = {
  problemDefinition: '문제 상황과 대상 사용자가 명확함',
  goalAndCriteria: '프로젝트 목표와 성공 기준이 구체적임',
  hardwareFeasibility: '보드와 부품 구성이 구현 가능함',
  scheduleFeasibility: '제작 일정이 현실적임',
  safetyReview: '안전 유의사항이 충분함',
  roleDistribution: '역할 분담이 구체적임',
}

const emptyChecklist = () => Object.fromEntries(Object.keys(reviewChecklistLabels).map((key) => [key, false]))
const cleanChecklist = (value = {}) => Object.fromEntries(
  Object.keys(reviewChecklistLabels).map((key) => [key, value?.[key] === true]),
)
const cleanText = (value, fallback = '') => String(value ?? '').trim() || fallback
const fail = (error, errorCode = 'review-failed') => ({ success: false, error, errorCode })
const REVISION_PROJECT_KEYS = Object.freeze([
  'status', 'feedback', 'checklist', 'requestedBy', 'requestedByName', 'requestedAt',
  'studentRead', 'studentReadAt', 'revisionRequestedAt', 'revisionRequestedBy',
  'revisionRequestedByName', 'revisionCount', 'reviewedAt', 'reviewedBy',
  'reviewedByName', 'updatedAt',
])
const normalizeDate = (value) => {
  if (!value) return null
  if (typeof value?.toDate === 'function') return value.toDate()
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

export function normalizeReviewHistory(history) {
  return (Array.isArray(history) ? history : []).map((item) => ({
    action: item?.action === 'approved' ? 'approved' : item?.action === 'resubmitted' ? 'resubmitted' : 'revision_requested',
    feedback: cleanText(item?.feedback),
    checklist: cleanChecklist(item?.checklist),
    reviewerName: cleanText(item?.reviewerName, '교사'),
    reviewedAt: normalizeDate(item?.reviewedAt ?? item?.createdAt),
    previousStatus: cleanText(item?.previousStatus),
    nextStatus: cleanText(item?.nextStatus),
  })).sort((a, b) => (b.reviewedAt?.getTime() ?? 0) - (a.reviewedAt?.getTime() ?? 0))
}

async function reviewProject(projectId, teacherUser, reviewData, action) {
  if (!db || !projectId || !teacherUser?.uid) return fail('로그인과 프로젝트 정보를 확인해 주세요.', 'auth-required')
  const feedback = cleanText(reviewData?.feedback)
  const checklist = cleanChecklist(reviewData?.checklist)
  if (action === 'revision_requested' && feedback.replace(/\s/g, '').length < 10) {
    return fail('수정 요청 피드백을 공백 제외 10자 이상 입력해 주세요.', 'invalid-feedback')
  }
  const missing = Object.entries(checklist).filter(([, checked]) => !checked).map(([key]) => reviewChecklistLabels[key])
  if (action === 'approved' && missing.length) {
    return fail(`승인 전 다음 항목을 확인해 주세요:\n${missing.join(', ')}`, 'checklist-required')
  }

  try {
    const result = await runTransaction(db, async (transaction) => {
      const currentUser = teacherUser
      const userRef = doc(db, 'teachers', teacherUser.uid)
      const projectRef = doc(db, 'projects', projectId)
      const historyRef = doc(collection(db, 'projects', projectId, 'reviewHistory'))
      const notificationRef = doc(collection(db, 'notifications'))
      const [userSnapshot, projectSnapshot] = await Promise.all([
        transaction.get(userRef),
        transaction.get(projectRef),
      ])
      if (!userSnapshot.exists() || userSnapshot.data()?.active !== true) throw Object.assign(new Error('teacher-required'), { reason: 'teacher-required' })
      if (!projectSnapshot.exists()) throw Object.assign(new Error('not-found'), { reason: 'not-found' })
      const project = projectSnapshot.data()
      const currentStatus = normalizeProjectStatus(project.status)
      const allowedStatuses = action === PROJECT_STATUS.APPROVED
        ? [PROJECT_STATUS.SUBMITTED, PROJECT_STATUS.RESUBMITTED]
        : [PROJECT_STATUS.SUBMITTED, PROJECT_STATUS.RESUBMITTED, PROJECT_STATUS.REVISION_REQUESTED]
      if (!allowedStatuses.includes(currentStatus)) throw Object.assign(new Error('status-conflict'), { reason: 'status-conflict' })
      if (!project.ownerId) throw Object.assign(new Error('owner-required'), { reason: 'owner-required' })
      const currentUpdatedAt = normalizeDate(project.updatedAt)?.toISOString() ?? ''
      if (
        (reviewData?.expectedStatus && normalizeProjectStatus(reviewData.expectedStatus) !== currentStatus) ||
        (reviewData?.expectedUpdatedAt && reviewData.expectedUpdatedAt !== currentUpdatedAt)
      ) {
        throw Object.assign(new Error('status-conflict'), { reason: 'status-conflict' })
      }

      const storedRevisionCount = Number(project.revisionCount ?? project.teacherReview?.revisionCount)
      const revisionCount = (Number.isFinite(storedRevisionCount) ? Math.max(0, storedRevisionCount) : 0)
        + (action === PROJECT_STATUS.REVISION_REQUESTED ? 1 : 0)
      const reviewedAt = new Date().toISOString()
      const reviewerName = cleanText(teacherUser.displayName) || '교사'
      const historyItem = {
        action,
        feedback,
        checklist,
        reviewerName,
        reviewedAt,
        previousStatus: currentStatus,
        nextStatus: action,
        notificationCreatedAt: action === PROJECT_STATUS.REVISION_REQUESTED ? reviewedAt : '',
        notificationReadAt: '',
        notificationWasRead: false,
      }
      const reviewUpdatePayload = {
        status: PROJECT_STATUS.REVISION_REQUESTED,
        feedback,
        checklist,
        requestedBy: teacherUser.uid,
        requestedByName: reviewerName,
        requestedAt: serverTimestamp(),
        studentRead: false,
        studentReadAt: null,
        revisionRequestedAt: serverTimestamp(),
        revisionRequestedBy: teacherUser.uid,
        revisionRequestedByName: reviewerName,
        revisionCount,
        reviewedAt: serverTimestamp(),
        reviewedBy: { uid: teacherUser.uid, displayName: reviewerName, email: cleanText(teacherUser.email) },
        reviewedByName: reviewerName,
        updatedAt: serverTimestamp(),
      }
      const projectUpdatePayload = action === PROJECT_STATUS.APPROVED
        ? {
            status: PROJECT_STATUS.APPROVED,
            approvedAt: serverTimestamp(),
            approvedBy: currentUser.uid,
            approvedByName: reviewerName,
            updatedAt: serverTimestamp(),
          }
        : reviewUpdatePayload
      if (action === PROJECT_STATUS.REVISION_REQUESTED) {
        const actualKeys = Object.keys(projectUpdatePayload)
        const unexpectedKeys = actualKeys.filter((key) => !REVISION_PROJECT_KEYS.includes(key))
        console.log('[Rules 대조 결과]', { actualKeys, unexpectedKeys })
        if (unexpectedKeys.length) {
          throw Object.assign(new Error(`unexpected-review-fields:${unexpectedKeys.join(',')}`), {
            reason: 'unexpected-review-fields',
          })
        }
      }
      if (import.meta.env?.DEV) {
        console.log('[수정 요청 시작]', {
          projectId,
          teacherUid: auth?.currentUser?.uid,
          teacherEmail: auth?.currentUser?.email,
        })
        console.group(action === PROJECT_STATUS.REVISION_REQUESTED ? '[수정 요청 저장 진단]' : '[교사 승인 진단]')
        console.log('projectPath:', projectRef.path)
        console.log('reviewHistoryPath:', historyRef.path)
        console.log('notificationPath:', notificationRef.path)
        console.log('projectId:', projectId)
        console.log('currentStatus:', project.status)
        console.log('normalizedStatus:', currentStatus)
        console.log('nextStatus:', action)
        console.log('currentUserUid:', auth?.currentUser?.uid)
        console.log('currentUserEmail:', auth?.currentUser?.email)
        console.log('resolvedTeacherUid:', teacherUser.uid)
        console.log('projectUpdateKeys:', Object.keys(projectUpdatePayload))
        console.log('[수정 요청 payload]', projectUpdatePayload)
        console.log('[수정 요청 payload keys]', Object.keys(projectUpdatePayload))
        console.log('[수정 요청 기존 문서]', {
          exists: projectSnapshot.exists(), projectId,
          ownerId: project.ownerId, ownerID: project.ownerID,
          status: project.status, revisionCount: project.revisionCount,
          keys: Object.keys(project),
        })
        console.log('[현재 로그인 교사]', {
          uid: auth?.currentUser?.uid,
          email: auth?.currentUser?.email,
          displayName: auth?.currentUser?.displayName,
        })
        console.log('[교사 권한 문서]', {
          path: userRef.path,
          exists: userSnapshot.exists(),
          data: userSnapshot.data(),
        })
        console.groupEnd()
      }
      if (action === PROJECT_STATUS.APPROVED) {
        console.group('[교사 승인 진단]')
        console.log('projectId:', projectId)
        console.log('teacherUid:', currentUser?.uid)
        console.log('projectOwnerId:', project?.ownerId)
        console.log('currentStatus:', project?.status)
        console.log('normalizedStatus:', currentStatus)
        console.log('nextStatus:', 'approved')
        console.log('projectUpdateKeys:', Object.keys(projectUpdatePayload || {}))
        console.log('projectUpdatePayload:', projectUpdatePayload)
        console.log('projectPath:', projectRef?.path)
        console.log('reviewHistoryPath:', historyRef?.path)
        console.log('notificationPath:', notificationRef?.path)
        console.log('notificationRecipientId:', project?.ownerId)
        console.groupEnd()

        const approvalDiagnosis = {
          hasProjectId: Boolean(projectId),
          hasTeacherUid: Boolean(currentUser?.uid),
          hasOwnerId: Boolean(project?.ownerId),
          teacherDocumentPath: currentUser?.uid ? `teachers/${currentUser.uid}` : null,
          currentStatus: project?.status,
          updateKeys: Object.keys(projectUpdatePayload || {}),
        }
        console.table(approvalDiagnosis)
      }
      if (import.meta.env?.DEV) console.log('[1/3] 프로젝트 상태 변경 시작', projectRef.path)
      transaction.update(projectRef, projectUpdatePayload)
      if (import.meta.env?.DEV) console.log('[1/3] 프로젝트 상태 변경 트랜잭션 등록 완료')
      if (import.meta.env?.DEV) console.log('[2/3] 검토 이력 저장 시작', historyRef.path)
      transaction.set(historyRef, {
        action,
        actorType: 'teacher',
        actorId: teacherUser.uid,
        actorName: reviewerName,
        feedback,
        checklist,
        teacherId: teacherUser.uid,
        teacherName: reviewerName,
        createdAt: serverTimestamp(),
        studentRead: false,
        studentReadAt: null,
      })
      if (import.meta.env?.DEV) console.log('[2/3] 검토 이력 저장 트랜잭션 등록 완료')
      if (action === PROJECT_STATUS.REVISION_REQUESTED) {
        if (import.meta.env?.DEV) console.log('[3/3] 학생 알림 저장 시작', notificationRef.path)
        transaction.set(notificationRef, {
          recipientId: project.ownerId,
          projectId,
          type: 'revision_requested',
          title: '기획안 수정 요청',
          message: '교사가 기획안 수정을 요청했습니다.',
          feedback,
          read: false,
          createdAt: serverTimestamp(),
        })
        if (import.meta.env?.DEV) console.log('[3/3] 학생 알림 저장 트랜잭션 등록 완료')
      } else if (action === PROJECT_STATUS.APPROVED) {
        transaction.set(notificationRef, {
          recipientId: project.ownerId,
          projectId,
          type: 'project_approved',
          title: '기획안 승인 완료',
          message: '교사가 프로젝트 기획안을 승인했습니다.',
          read: false,
          createdAt: serverTimestamp(),
        })
      }
      return { revisionCount, historyItem }
    })
    return {
      success: true,
      message: action === PROJECT_STATUS.REVISION_REQUESTED
        ? '수정 요청이 완료되었습니다. 학생에게 피드백이 전달되었으며 기획안을 다시 수정할 수 있습니다.'
        : '프로젝트 기획안을 승인했습니다.',
      status: action,
      ...result,
    }
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.error(action === PROJECT_STATUS.REVISION_REQUESTED ? '[수정 요청 실패]' : '[교사 승인 실패]', {
        code: error?.code,
        message: error?.message,
        stack: error?.stack,
        projectId,
        currentUserUid: auth?.currentUser?.uid,
        currentUserEmail: auth?.currentUser?.email,
        teacherDocumentPath: teacherUser?.uid ? `teachers/${teacherUser.uid}` : null,
        projectPath: projectId ? `projects/${projectId}` : null,
        reviewHistoryPath: projectId ? `projects/${projectId}/reviewHistory/{generatedId}` : null,
        notificationPath: 'notifications/{generatedId}',
      })
      console.error('[Teacher Review]', {
        projectId,
        teacherUid: teacherUser?.uid,
        currentStatus: reviewData?.expectedStatus || 'unknown',
        nextStatus: action,
        errorCode: error?.code ?? error?.reason ?? 'unknown',
        message: error?.message ?? '',
      })
    }
    if (error?.reason === 'teacher-required' || error?.code === 'permission-denied') {
      return fail('수정 요청을 저장할 권한이 없습니다. 교사 계정 등록 상태를 확인해 주세요.', error?.code ?? error.reason)
    }
    if (error?.reason === 'not-found' || error?.code === 'not-found') return fail('해당 프로젝트를 찾을 수 없습니다.', 'not-found')
    if (error?.code === 'unauthenticated') return fail('로그인이 만료되었습니다. 다시 로그인해 주세요.', 'unauthenticated')
    if (error?.code === 'invalid-argument') return fail('수정 요청 데이터 형식이 올바르지 않습니다.', 'invalid-argument')
    if (error?.reason === 'owner-required') return fail('프로젝트 소유자 정보가 없어 수정 요청을 보낼 수 없습니다.', 'invalid-argument')
    if (error?.reason === 'unexpected-review-fields') return fail('수정 요청 payload에 허용되지 않은 필드가 포함되어 저장을 중단했습니다.', 'invalid-argument')
    if (error?.reason === 'status-conflict' || error?.code === 'aborted') {
      return fail('다른 사용자가 프로젝트 상태를 먼저 변경했습니다.\n새로고침 후 다시 확인해 주세요.', 'status-conflict')
    }
    return fail('수정 요청 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.', error?.code)
  }
}

// 명시적으로 호출하는 로컬 개발 진단 전용 함수입니다. 운영 빌드에서는 실행을 거부합니다.
export async function diagnoseRevisionRequestWrites({ projectId, projectPayload, historyPayload, notificationPayload, diagnosticId }) {
  if (!import.meta.env?.DEV) throw new Error('REVISION_DIAGNOSTIC_DEV_ONLY')
  if (!projectId || !diagnosticId) throw new Error('REVISION_DIAGNOSTIC_ID_REQUIRED')
  const projectRef = doc(db, 'projects', projectId)
  const historyRef = doc(db, 'projects', projectId, 'reviewHistory', diagnosticId)
  const notificationRef = doc(db, 'notifications', diagnosticId)
  const result = { projectUpdate: null, reviewHistoryCreate: null, notificationCreate: null }
  const steps = [
    ['projectUpdate', projectRef, projectPayload, updateDoc],
    ['reviewHistoryCreate', historyRef, { ...historyPayload, diagnosticId }, setDoc],
    ['notificationCreate', notificationRef, { ...notificationPayload, diagnosticId }, setDoc],
  ]
  for (let index = 0; index < steps.length; index += 1) {
    const [key, reference, payload, writer] = steps[index]
    try {
      console.log(`[진단 ${index + 1}/3] ${key} 시작`, { path: reference.path, keys: Object.keys(payload), payload })
      await writer(reference, payload)
      result[key] = { success: true, path: reference.path }
      console.log(`[진단 ${index + 1}/3] ${key} 성공`, { path: reference.path })
    } catch (error) {
      result[key] = { success: false, path: reference.path, code: error?.code, message: error?.message }
      console.error(`[진단 ${index + 1}/3] ${key} 실패`, { path: reference.path, code: error?.code, message: error?.message, payload })
      break
    }
  }
  console.table(result)
  return result
}

export const requestRevision = (projectId, teacherUser, reviewData) =>
  reviewProject(projectId, teacherUser, reviewData, PROJECT_STATUS.REVISION_REQUESTED)

export const approveProject = (projectId, teacherUser, reviewData) =>
  reviewProject(projectId, teacherUser, reviewData, PROJECT_STATUS.APPROVED)

export async function getReviewHistory(projectId) {
  if (!db || !projectId) return fail('프로젝트 정보를 확인해 주세요.')
  try {
    return await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(doc(db, 'projects', projectId))
      if (!snapshot.exists()) return fail('프로젝트를 찾을 수 없습니다.', 'not-found')
      return { success: true, history: normalizeReviewHistory(snapshot.data().reviewHistory) }
    })
  } catch (error) {
    return fail(error?.code === 'permission-denied'
      ? 'Firestore 보안 규칙으로 인해 검토 이력을 조회할 수 없습니다.'
      : '검토 이력을 불러오지 못했습니다.', error?.code)
  }
}

export { emptyChecklist }
