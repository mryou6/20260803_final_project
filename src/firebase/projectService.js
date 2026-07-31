// 학생 소유 프로젝트의 생성, 조회, 수정, 제출과 삭제를 담당합니다.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  runTransaction,
  writeBatch,
} from 'firebase/firestore'
import { db } from './firebaseConfig.js'
import { validateSubmissionData } from '../utils/projectValidation.js'
import { sanitizeForFirestore } from '../utils/firestoreSanitizer.js'
import { PROJECT_STATUSES, normalizeProjectStatus } from '../constants/projectStatus.js'
import { normalizeProjectData } from '../utils/dataNormalizer.js'

const allowedStatuses = PROJECT_STATUSES

const fail = (error) => ({ success: false, error })
const errorMessages = {
  'permission-denied': 'Firestore 보안 규칙으로 인해 저장할 수 없습니다.',
  unauthenticated: '로그인 상태를 확인해 주세요.',
  'invalid-argument': '저장할 수 없는 데이터가 포함되어 있습니다.',
  unavailable: 'Firestore 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.',
  'not-found': '저장하거나 수정할 프로젝트를 찾지 못했습니다.',
}

function safeError(error, fallback = '프로젝트 저장 중 오류가 발생했습니다.') {
  if (import.meta.env.DEV) console.error('[Firestore] 실패 code:', error?.code ?? 'unknown')
  return fail(errorMessages[error?.code] ?? fallback)
}

function devLog(message) {
  if (!import.meta.env.DEV) return
  console.info(message)
}

function validUser(user) {
  return Boolean(db && user?.uid)
}

export async function createProject(user, projectData) {
  if (!validUser(user)) return fail('로그인 정보를 확인해 주세요.')

  try {
    devLog('[Firestore] 프로젝트 신규 생성 시작')
    const projectRef = doc(collection(db, 'projects'))
    const cleanData = sanitizeForFirestore(projectData)
    await setDoc(projectRef, {
      ...cleanData,
      projectId: projectRef.id,
      ownerId: user.uid,
      ownerEmail: user.email ?? '',
      ownerName: user.displayName ?? '',
      status: 'draft',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      submittedAt: null,
    })
    devLog('[Firestore] 프로젝트 신규 생성 성공', projectRef.id)
    return { success: true, projectId: projectRef.id }
  } catch (error) {
    return safeError(error)
  }
}

export async function updateProject(projectId, user, projectData) {
  if (!validUser(user) || !projectId) return fail('프로젝트 정보를 확인해 주세요.')

  try {
    devLog('[Firestore] 기존 프로젝트 업데이트 시작', projectId)
    const projectRef = doc(db, 'projects', projectId)
    const snapshot = await getDoc(projectRef)
    if (!snapshot.exists()) return fail('프로젝트를 찾을 수 없습니다.')
    const saved = snapshot.data()
    if (saved.ownerId !== user.uid) return fail('이 프로젝트를 수정할 권한이 없습니다.')
    const savedStatus = normalizeProjectStatus(saved.status)
    if (!['draft', 'revision_requested'].includes(savedStatus)) return fail('작성 중이거나 수정 요청된 프로젝트만 수정할 수 있습니다.')

    const cleanData = sanitizeForFirestore(projectData)
    await updateDoc(projectRef, {
      ...cleanData,
      projectId,
      ownerId: saved.ownerId,
      ownerEmail: saved.ownerEmail,
      ownerName: saved.ownerName,
      status: allowedStatuses.includes(savedStatus) ? savedStatus : 'draft',
      teacherReview: saved.teacherReview ?? null,
      reviewHistory: saved.reviewHistory ?? [],
      updatedAt: serverTimestamp(),
      submittedAt: saved.submittedAt ?? null,
      ...(savedStatus === 'revision_requested' ? {
        revisionInProgress: true,
        revisionStartedAt: saved.revisionStartedAt ?? serverTimestamp(),
      } : {}),
    })
    devLog('[Firestore] 기존 프로젝트 업데이트 성공', projectId)
    return { success: true, projectId }
  } catch (error) {
    return safeError(error)
  }
}

export async function getMyProjects(uid) {
  if (!db || !uid) return fail('로그인 정보를 확인해 주세요.')

  try {
    const projectsQuery = query(
      collection(db, 'projects'),
      where('ownerId', '==', uid),
      orderBy('updatedAt', 'desc'),
    )
    const snapshot = await getDocs(projectsQuery)
    return {
      success: true,
      data: snapshot.docs.map((item) => normalizeProjectData(item.data(), item.id)),
    }
  } catch (error) {
    if (error?.code === 'failed-precondition') {
      return fail('프로젝트 목록 조회에 필요한 Firestore 복합 색인을 생성해 주세요.')
    }
    return safeError(error, '저장된 프로젝트 목록을 불러오지 못했습니다.')
  }
}

export async function getProjectById(projectId, uid) {
  if (!db || !projectId || !uid) return fail('기획안과 프로젝트 정보를 찾을 수 없습니다.')

  try {
    const snapshot = await getDoc(doc(db, 'projects', projectId))
    if (!snapshot.exists()) return fail('해당 프로젝트를 찾을 수 없습니다.')
    const data = snapshot.data()
    if (data.ownerId !== uid) return fail('본인의 프로젝트만 확인할 수 있습니다.')
    const historySnapshot = await getDocs(query(
      collection(db, 'projects', projectId, 'reviewHistory'),
      orderBy('createdAt', 'asc'),
    ))
    const subcollectionHistory = historySnapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
    return {
      success: true,
      data: {
        id: snapshot.id,
        ...data,
        reviewHistory: subcollectionHistory.length ? subcollectionHistory : (data.reviewHistory ?? []),
      },
    }
  } catch (error) {
    return safeError(error, '프로젝트를 불러오지 못했습니다.')
  }
}

export async function submitProject(projectId, user) {
  if (!validUser(user) || !projectId) return fail('프로젝트 정보를 확인해 주세요.')

  let failureStep = 'project-update'
  let failurePath = `projects/${projectId}`
  try {
    const projectRef = doc(db, 'projects', projectId)
    const snapshot = await getDoc(projectRef)
    if (!snapshot.exists()) return fail('재제출할 프로젝트를 찾을 수 없습니다.')
    const data = snapshot.data()
    if (data.ownerId !== user.uid) return fail('이 프로젝트를 제출할 권한이 없습니다.')
    const currentStatus = normalizeProjectStatus(data.status)
    if (!['draft', 'revision_requested'].includes(currentStatus)) {
      return fail(currentStatus === 'approved' ? '승인 완료된 프로젝트는 다시 제출할 수 없습니다.' : '현재 상태에서는 재제출할 수 없습니다.')
    }
    const missing = validateSubmissionData(data)
    if (missing.length) return fail(`최종 제출 전 다음 항목을 작성해 주세요: ${missing.join(', ')}`)

    const wasReturned = currentStatus === 'revision_requested'
    const teacherId = String(data.teacherReview?.requestedBy ?? data.teacherReview?.reviewedBy?.uid ?? '').trim()
    const projectUpdatePayload = {
      status: wasReturned ? 'resubmitted' : 'submitted',
      submittedAt: serverTimestamp(),
      ...(wasReturned ? { resubmittedAt: serverTimestamp(), revisionInProgress: false } : {}),
      updatedAt: serverTimestamp(),
      resubmissionCount: wasReturned ? Math.max(0, Number(data.resubmissionCount) || 0) + 1 : Math.max(0, Number(data.resubmissionCount) || 0),
    }
    if (import.meta.env?.DEV && wasReturned) {
      console.debug('[학생 재제출 저장]', {
        projectId,
        currentStatus,
        nextStatus: 'resubmitted',
        projectUpdateKeys: Object.keys(projectUpdatePayload),
        teacherId,
        createsReviewHistory: true,
        createsNotification: Boolean(teacherId),
      })
    }
    await runTransaction(db, async (transaction) => {
      const fresh = await transaction.get(projectRef)
      if (!fresh.exists() || fresh.data().ownerId !== user.uid) throw Object.assign(new Error('permission-denied'), { code: 'permission-denied' })
      if (normalizeProjectStatus(fresh.data().status) !== currentStatus) throw Object.assign(new Error('status-conflict'), { code: 'aborted' })
      failureStep = 'project-update'
      failurePath = `projects/${projectId}`
      transaction.update(projectRef, projectUpdatePayload)
      if (wasReturned) {
        failureStep = 'review-history-create'
        const historyRef = doc(collection(db, 'projects', projectId, 'reviewHistory'))
        failurePath = `projects/${projectId}/reviewHistory/${historyRef.id}`
        transaction.set(historyRef, {
          action: 'resubmitted',
          actorType: 'student',
          actorId: user.uid,
          actorName: user.displayName ?? '',
          createdBy: user.uid,
          createdAt: serverTimestamp(),
          revisionNumber: Math.max(0, Number(data.teacherReview?.revisionCount) || 0),
        })
        if (teacherId) {
          failureStep = 'teacher-notification-create'
          const notificationRef = doc(collection(db, 'notifications'))
          failurePath = `notifications/${notificationRef.id}`
          transaction.set(notificationRef, {
            recipientId: teacherId,
            projectId,
            type: 'project_resubmitted',
            title: '수정 기획안 재제출',
            message: '학생이 수정한 기획안을 다시 제출했습니다.',
            read: false,
            createdAt: serverTimestamp(),
          })
        }
      }
      failureStep = 'batch-commit'
    })
    return {
      success: true,
      wasReturned,
      message: wasReturned
        ? '수정한 프로젝트 기획안이 다시 제출되었습니다.'
        : '프로젝트 기획안이 최종 제출되었습니다.',
    }
  } catch (error) {
    if (import.meta.env?.DEV) {
      console.error('[학생 재제출 실패]', {
        step: failureStep,
        path: failurePath,
        code: error?.code ?? 'unknown',
        message: error?.message ?? '',
      })
    }
    if (error?.code === 'permission-denied') return fail('본인의 프로젝트만 재제출할 수 있습니다.')
    return safeError(error, '프로젝트 기획안을 제출하지 못했습니다.')
  }
}

export async function deleteDraftProject(projectId, user) {
  if (!validUser(user) || !projectId) return fail('프로젝트 정보를 확인해 주세요.')

  try {
    const projectRef = doc(db, 'projects', projectId)
    const snapshot = await getDoc(projectRef)
    if (!snapshot.exists()) return fail('프로젝트를 찾을 수 없습니다.')
    const data = snapshot.data()
    if (data.ownerId !== user.uid) return fail('이 프로젝트를 삭제할 권한이 없습니다.')
    if (data.status !== 'draft') return fail('작성 중인 프로젝트만 삭제할 수 있습니다.')
    await deleteDoc(projectRef)
    return { success: true }
  } catch (error) {
    return safeError(error, '프로젝트를 삭제하지 못했습니다.')
  }
}

export async function markTeacherFeedbackAsRead(projectId, user) {
  if (!validUser(user) || !projectId) return fail('로그인과 프로젝트 정보를 확인해 주세요.')
  try {
    const projectRef = doc(db, 'projects', projectId)
    const snapshot = await getDoc(projectRef)
    if (!snapshot.exists()) return fail('프로젝트를 찾을 수 없습니다.')
    const project = snapshot.data()
    if (project.ownerId !== user.uid) return fail('이 피드백을 확인할 권한이 없습니다.')
    if (normalizeProjectStatus(project.status) !== 'revision_requested') return fail('수정 요청 상태의 프로젝트만 읽음 처리할 수 있습니다.')
    if (project.teacherReview?.studentRead === true && project.revisionInProgress === true) {
      return { success: true, alreadyRead: true, readAt: project.teacherReview.studentReadAt }
    }
    const notificationSnapshot = await getDocs(query(
      collection(db, 'notifications'),
      where('recipientId', '==', user.uid),
    ))
    const batch = writeBatch(db)
    batch.update(projectRef, {
      'teacherReview.studentRead': true,
      'teacherReview.studentReadAt': serverTimestamp(),
      feedbackUnread: false,
      revisionInProgress: true,
      revisionStartedAt: project.revisionStartedAt ?? serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    notificationSnapshot.docs.filter((item) => {
      const notification = item.data()
      return notification.projectId === projectId
        && notification.type === 'revision_requested'
        && notification.read !== true
    }).forEach((item) => {
      batch.update(item.ref, { read: true, readAt: serverTimestamp() })
    })
    await batch.commit()
    return { success: true, alreadyRead: false }
  } catch (error) {
    return safeError(error, '피드백 읽음 상태를 저장하지 못했습니다.')
  }
}
