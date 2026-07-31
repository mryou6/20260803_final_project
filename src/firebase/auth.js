// Firebase Google 로그인, 로그아웃과 안전한 인증 상태 관찰 기능을 제공합니다.
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth'
import { auth } from './firebaseConfig.js'

const AUTH_ERROR_MESSAGES = {
  'auth/popup-closed-by-user': '로그인 창이 닫혔습니다. 다시 시도해 주세요.',
  'auth/popup-blocked': '브라우저가 로그인 팝업을 차단했습니다. 팝업 허용 후 다시 시도해 주세요.',
  'auth/network-request-failed': '네트워크 연결을 확인해 주세요.',
  'auth/unauthorized-domain': '현재 도메인이 Firebase 인증 허용 목록에 등록되지 않았습니다.',
  'auth/cancelled-popup-request': '이미 로그인 창이 열려 있습니다.',
}

export function normalizeUser(user) {
  if (!user) return null

  return {
    uid: user.uid ?? '',
    email: user.email ?? '',
    displayName: user.displayName ?? '',
    photoURL: user.photoURL ?? '',
  }
}

export function getAuthErrorMessage(errorCode) {
  return AUTH_ERROR_MESSAGES[errorCode] ?? 'Google 로그인 중 오류가 발생했습니다.'
}

export async function signInWithGoogle() {
  if (!auth) {
    return { success: false, error: 'Firebase 인증을 초기화하지 못했습니다.' }
  }

  try {
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    const credential = await signInWithPopup(auth, provider)
    return { success: true, user: normalizeUser(credential.user) }
  } catch (error) {
    return { success: false, error: getAuthErrorMessage(error?.code) }
  }
}

export async function signOutUser() {
  if (!auth) {
    return { success: false, error: 'Firebase 인증을 초기화하지 못했습니다.' }
  }

  try {
    await signOut(auth)
    return { success: true }
  } catch {
    return { success: false, error: '로그아웃 중 오류가 발생했습니다.' }
  }
}

export function observeAuthState(callback) {
  if (!auth) {
    queueMicrotask(() => callback(null))
    return () => {}
  }

  return onAuthStateChanged(auth, (user) => callback(normalizeUser(user)))
}
