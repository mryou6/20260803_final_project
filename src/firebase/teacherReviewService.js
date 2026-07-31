import { collection, doc, runTransaction, serverTimestamp } from 'firebase/firestore'
import { db } from './firebaseConfig.js'
import { normalizeProjectStatus } from '../constants/projectStatus.js'

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
      const allowedStatuses = action === 'approved'
        ? ['submitted', 'resubmitted']
        : ['submitted', 'resubmitted', 'revision_requested']
      if (!allowedStatuses.includes(currentStatus)) throw Object.assign(new Error('status-conflict'), { reason: 'status-conflict' })
      if (!project.ownerId) throw Object.assign(new Error('owner-required'), { reason: 'owner-required' })
      const currentUpdatedAt = normalizeDate(project.updatedAt)?.toISOString() ?? ''
      if (
        (reviewData?.expectedStatus && normalizeProjectStatus(reviewData.expectedStatus) !== currentStatus) ||
        (reviewData?.expectedUpdatedAt && reviewData.expectedUpdatedAt !== currentUpdatedAt)
      ) {
        throw Object.assign(new Error('status-conflict'), { reason: 'status-conflict' })
      }

      const previousHistory = Array.isArray(project.reviewHistory) ? project.reviewHistory : []
      const previousNotification = project.teacherReview?.notification ?? {}
      const preservedHistory = previousHistory.map((item, index) => {
        if (index !== previousHistory.length - 1 || !['returned', 'revision_requested'].includes(item?.action)) return item
        return {
          ...item,
          notificationCreatedAt: item.notificationCreatedAt ?? normalizeDate(previousNotification.createdAt)?.toISOString() ?? '',
          notificationReadAt: normalizeDate(previousNotification.readAt)?.toISOString() ?? item.notificationReadAt ?? '',
          notificationWasRead: previousNotification.isRead === true || item.notificationWasRead === true,
        }
      })
      const revisionCount = Math.max(0, Number(project.teacherReview?.revisionCount) || 0) + (action === 'revision_requested' ? 1 : 0)
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
        notificationCreatedAt: action === 'revision_requested' ? reviewedAt : '',
        notificationReadAt: '',
        notificationWasRead: false,
      }
      const reviewUpdatePayload = {
        status: action,
        teacherReview: {
          status: action,
          feedback,
          checklist,
          requestedBy: action === 'revision_requested' ? teacherUser.uid : project.teacherReview?.requestedBy ?? '',
          requestedByName: action === 'revision_requested' ? reviewerName : project.teacherReview?.requestedByName ?? '',
          requestedAt: action === 'revision_requested' ? serverTimestamp() : project.teacherReview?.requestedAt ?? null,
          studentRead: action === 'revision_requested' ? false : project.teacherReview?.studentRead === true,
          studentReadAt: action === 'revision_requested' ? null : project.teacherReview?.studentReadAt ?? null,
          reviewedBy: {
            uid: teacherUser.uid,
            displayName: reviewerName,
            email: cleanText(teacherUser.email),
          },
          reviewedAt: serverTimestamp(),
          revisionCount,
          notification: action === 'revision_requested'
            ? { createdAt: serverTimestamp(), isRead: false, readAt: null, readBy: null }
            : {
                createdAt: previousNotification.createdAt ?? null,
                isRead: previousNotification.isRead === true,
                readAt: previousNotification.readAt ?? null,
                readBy: previousNotification.readBy ?? null,
              },
        },
        lastTeacherFeedback: {
          type: action,
          message: feedback,
          createdBy: teacherUser.uid,
          createdByName: reviewerName,
          createdAt: serverTimestamp(),
          readByStudent: false,
          readAt: null,
        },
        feedbackUnread: action === 'revision_requested',
        reviewHistory: [...preservedHistory, historyItem].slice(-10),
        ...(action === 'revision_requested' ? { revisionInProgress: false } : {}),
        ...(action === 'approved' ? {
          approvedAt: serverTimestamp(),
          approvedBy: teacherUser.uid,
          approvedByName: reviewerName,
          revisionInProgress: false,
        } : {}),
        updatedAt: serverTimestamp(),
      }
      const projectUpdatePayload = action === 'approved'
        ? {
            status: 'approved',
            approvedAt: serverTimestamp(),
            approvedBy: currentUser.uid,
            approvedByName: reviewerName,
            updatedAt: serverTimestamp(),
          }
        : reviewUpdatePayload
      if (action === 'approved') {
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
      transaction.update(projectRef, projectUpdatePayload)
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
      if (action === 'revision_requested') {
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
      } else if (action === 'approved') {
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
      message: action === 'revision_requested' ? '학생에게 수정 요청을 전송했습니다.' : '프로젝트 기획안을 승인했습니다.',
      status: action,
      ...result,
    }
  } catch (error) {
    if (action === 'approved') {
      console.error('[교사 승인 실패]', {
        code: error?.code,
        message: error?.message,
        name: error?.name,
        stack: error?.stack,
      })
    }
    if (import.meta.env?.DEV) {
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
      return fail('교사 권한 또는 Firestore 보안 규칙을 확인해 주세요.', error?.code ?? error.reason)
    }
    if (error?.reason === 'not-found' || error?.code === 'not-found') return fail('해당 프로젝트를 찾을 수 없습니다.', 'not-found')
    if (error?.code === 'unauthenticated') return fail('로그인 후 다시 시도해 주세요.', 'unauthenticated')
    if (error?.code === 'invalid-argument') return fail('수정 요청 데이터 형식이 올바르지 않습니다.', 'invalid-argument')
    if (error?.reason === 'owner-required') return fail('프로젝트 소유자 정보가 없어 수정 요청을 보낼 수 없습니다.', 'invalid-argument')
    if (error?.reason === 'status-conflict' || error?.code === 'aborted') {
      return fail('다른 사용자가 프로젝트 상태를 먼저 변경했습니다.\n새로고침 후 다시 확인해 주세요.', 'status-conflict')
    }
    return fail('수정 요청을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.', error?.code)
  }
}

export const requestRevision = (projectId, teacherUser, reviewData) =>
  reviewProject(projectId, teacherUser, reviewData, 'revision_requested')

export const approveProject = (projectId, teacherUser, reviewData) =>
  reviewProject(projectId, teacherUser, reviewData, 'approved')

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
