import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from './firebaseConfig.js'
import { sanitizeForFirestore } from '../utils/firestoreSanitizer.js'

const fail = (error) => ({ success: false, error })

export async function saveDraft(user, { draftId, projectId = null, currentStep = 1, formData = {} } = {}) {
  const collectionName = 'drafts'
  const ownerId = user?.uid
  const draftRef = draftId ? doc(db, collectionName, draftId) : doc(collection(db, collectionName))

  if (!db || !ownerId) return fail('로그인 정보를 확인해 주세요.')

  try {
    const existing = draftId ? await getDoc(draftRef) : null
    if (existing?.exists() && existing.data().ownerId !== ownerId) {
      return fail('본인의 임시저장 문서만 수정할 수 있습니다.')
    }

    const data = {
      ownerId,
      ownerEmail: user.email ?? '',
      projectId: projectId ?? null,
      currentStep: Math.max(1, Number(currentStep) || 1),
      formData: sanitizeForFirestore(formData),
      status: 'draft',
      updatedAt: serverTimestamp(),
    }
    if (!existing?.exists()) data.createdAt = serverTimestamp()

    await setDoc(draftRef, data, { merge: true })
    return { success: true, draftId: draftRef.id, savedAt: new Date().toISOString() }
  } catch (error) {
    console.error('[임시저장 실패]', {
      code: error?.code,
      message: error?.message,
      collectionName,
      draftId: draftRef.id,
      ownerId,
      currentStep,
    })
    return fail('임시저장하지 못했습니다. 잠시 후 다시 시도해 주세요.')
  }
}

export async function loadDraft(user, { draftId = null, projectId = undefined } = {}) {
  if (!db || !user?.uid) return fail('로그인 정보를 확인해 주세요.')

  try {
    if (draftId) {
      const snapshot = await getDoc(doc(db, 'drafts', draftId))
      if (!snapshot.exists() || snapshot.data().ownerId !== user.uid) return { success: true, data: null }
      return { success: true, data: { id: snapshot.id, ...snapshot.data() } }
    }

    const snapshot = await getDocs(query(
      collection(db, 'drafts'),
      where('ownerId', '==', user.uid),
    ))
    const matching = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .filter((item) => projectId === undefined || (item.projectId ?? null) === (projectId ?? null))
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
    return { success: true, data: matching[0] ?? null }
  } catch (error) {
    console.error('[임시저장 불러오기 실패]', { code: error?.code, message: error?.message, ownerId: user.uid })
    return fail('임시저장 내용을 불러오지 못했습니다.')
  }
}

export async function getMyDrafts(user) {
  if (!db || !user?.uid) return fail('로그인 정보를 확인해 주세요.')
  try {
    const snapshot = await getDocs(query(
      collection(db, 'drafts'),
      where('ownerId', '==', user.uid),
    ))
    const data = snapshot.docs
      .map((item) => ({ id: item.id, ...item.data() }))
      .sort((a, b) => (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0))
    return { success: true, data }
  } catch (error) {
    console.error('[임시저장 목록 조회 실패]', { code: error?.code, message: error?.message, ownerId: user.uid })
    return fail('작성 중인 프로젝트 목록을 불러오지 못했습니다.')
  }
}

export async function deleteDraft(draftId, user) {
  if (!db || !draftId || !user?.uid) return { success: true }
  try {
    const draftRef = doc(db, 'drafts', draftId)
    const snapshot = await getDoc(draftRef)
    if (!snapshot.exists()) return { success: true }
    if (snapshot.data().ownerId !== user.uid) return fail('본인의 임시저장 문서만 삭제할 수 있습니다.')
    await deleteDoc(draftRef)
    return { success: true }
  } catch (error) {
    return fail('임시저장 문서를 삭제하지 못했습니다.')
  }
}
