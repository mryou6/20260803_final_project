import { doc, getDocFromServer } from 'firebase/firestore'
import { db } from './firebaseConfig.js'
import { normalizeRole } from '../utils/dataNormalizer.js'

const devLog = (message, value) => {
  if (!import.meta.env?.DEV) return
  if (value === undefined) console.info(message)
  else console.info(message, value)
}

export { normalizeRole }

export async function getUserRole(user) {
  if (!db || !user?.uid) {
    return {
      success: false,
      role: 'student',
      errorCode: 'auth-required',
      message: '로그인 정보를 확인할 수 없습니다.',
    }
  }

  devLog('[Teacher Auth] currentUser.uid', user.uid)
  try {
    const snapshot = await getDocFromServer(doc(db, 'teachers', user.uid))
    const isActiveTeacher = snapshot.exists() && snapshot.data()?.active === true
    devLog('[Teacher Auth] 교사 문서 존재 여부', snapshot.exists())
    devLog('[Teacher Auth] active 여부', snapshot.data()?.active === true)
    return {
      success: true,
      role: isActiveTeacher ? 'teacher' : 'student',
      exists: snapshot.exists(),
      active: snapshot.data()?.active === true,
    }
  } catch (error) {
    devLog('[Teacher Auth] Firestore error code', error?.code ?? 'unknown')
    devLog('[Teacher Auth] error message', error?.message ?? '')
    return {
      success: false,
      role: 'student',
      exists: false,
      active: false,
      errorCode: error?.code === 'permission-denied' ? 'permission-denied' : 'role-read-failed',
      message: error?.code === 'permission-denied'
        ? '교사 권한 또는 Firestore 보안 규칙을 확인해 주세요.'
        : '교사 권한 정보를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',
    }
  }
}

export async function isCurrentUserTeacher(user) {
  const result = await getUserRole(user)
  return { ...result, isTeacher: result.success && result.role === 'teacher' }
}
