// 로그인 사용자의 공개 프로필만 users 컬렉션에 안전하게 저장합니다.
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebaseConfig.js'
import { auth } from './firebaseConfig.js'
import { getUserRole } from './roleService.js'

const ROLE_ENDPOINT = '/.netlify/functions/resolve-user-role'

export async function saveOrUpdateUser(user) {
  if (!db || !user?.uid) return { success: false, error: '사용자 정보를 저장할 수 없습니다.' }

  try {
    if (import.meta.env.DEV) console.info('[Firestore] 사용자 문서 확인 시작')
    const userRef = doc(db, 'users', user.uid)
    const snapshot = await getDoc(userRef)
    const profile = {
      email: user.email ?? '',
      displayName: user.displayName ?? '',
      photoURL: user.photoURL ?? '',
      lastLoginAt: serverTimestamp(),
    }

    if (snapshot.exists()) {
      await setDoc(userRef, profile, { merge: true })
    } else {
      await setDoc(userRef, {
        uid: user.uid,
        ...profile,
        role: 'student',
        createdAt: serverTimestamp(),
      })
    }

    return { success: true }
  } catch (error) {
    if (import.meta.env.DEV) console.error('[학생 계정 등록 실패]', { code: error?.code, message: error?.message })
    return { success: false, error: '학생 계정 정보를 등록하지 못했습니다.' }
  }
}

// 서버에서 사전 승인 교사 이메일을 확인하고 최종 사용자 역할을 반환합니다.
export async function resolveUserRole(user) {
  if (!user?.uid || !auth?.currentUser || auth.currentUser.uid !== user.uid) return 'unknown'

  try {
    const currentRole = await getUserRole(user)
    if (currentRole.success && currentRole.role === 'teacher') return 'teacher'

    const idToken = await auth.currentUser.getIdToken()
    const response = await fetch(ROLE_ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      cache: 'no-store',
    })
    const payload = await response.json().catch(() => null)
    if (!response.ok || payload?.ok !== true) return currentRole.success ? currentRole.role : 'unknown'

    const refreshedRole = await getUserRole(user)
    return refreshedRole.success ? refreshedRole.role : payload.role === 'teacher' ? 'teacher' : currentRole.role
  } catch {
    return 'unknown'
  }
}

// 로그인 사용자가 서버 검증을 통과한 교사인지 확인합니다.
export async function isTeacherUser(user) {
  const result = await getUserRole(user)
  return result.success && result.role === 'teacher'
}
