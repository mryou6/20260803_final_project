// Firebase ID 토큰을 검증하고 서버에서 최종 사용자 역할을 결정합니다.
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

const response = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) })

function normalizePrivateKey(value) {
  return String(value ?? '').trim().replace(/^(["'])(.*)\1$/s, '$2').replace(/\\n/g, '\n')
}

function required(value, errorCode) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw Object.assign(new Error(errorCode), { code: errorCode })
  return normalized
}

function getServiceAccount() {
  const json = String(process.env.FIREBASE_SERVICE_ACCOUNT ?? '').trim()
  if (json) {
    let account
    try {
      account = JSON.parse(json)
    } catch {
      throw Object.assign(new Error('FIREBASE_SERVICE_ACCOUNT_INVALID_JSON'), {
        code: 'FIREBASE_SERVICE_ACCOUNT_INVALID_JSON',
      })
    }
    return {
      projectId: required(account.project_id ?? account.projectId, 'FIREBASE_PROJECT_ID_MISSING'),
      clientEmail: required(account.client_email ?? account.clientEmail, 'FIREBASE_CLIENT_EMAIL_MISSING'),
      privateKey: required(normalizePrivateKey(account.private_key ?? account.privateKey), 'FIREBASE_PRIVATE_KEY_MISSING'),
    }
  }

  // 기존 ADMIN 이름과 일반적인 Netlify 이름을 모두 지원합니다.
  return {
    projectId: required(
      process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.FIREBASE_PROJECT_ID,
      'FIREBASE_PROJECT_ID_MISSING',
    ),
    clientEmail: required(
      process.env.FIREBASE_ADMIN_CLIENT_EMAIL ?? process.env.FIREBASE_CLIENT_EMAIL,
      'FIREBASE_CLIENT_EMAIL_MISSING',
    ),
    privateKey: required(normalizePrivateKey(
      process.env.FIREBASE_ADMIN_PRIVATE_KEY ?? process.env.FIREBASE_PRIVATE_KEY,
    ), 'FIREBASE_PRIVATE_KEY_MISSING'),
  }
}

function getAdminServices() {
  // 같은 함수 인스턴스가 재사용되어도 기본 앱을 한 번만 초기화합니다.
  const app = getApps().length ? getApp() : initializeApp({ credential: cert(getServiceAccount()) })
  return { adminAuth: getAuth(app), adminDb: getFirestore(app) }
}

function getBearerToken(event) {
  const authorization = String(event.headers?.authorization ?? event.headers?.Authorization ?? '').trim()
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() ?? ''
}

function errorResponse(error) {
  const code = String(error?.code ?? '')
  if (code.startsWith('auth/')) {
    return response(401, { ok: false, success: false, code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' })
  }
  if (code.startsWith('FIREBASE_') || code === 'app/invalid-credential') {
    return response(500, { ok: false, success: false, code: 'INTERNAL_ERROR', message: '사용자 역할 확인에 실패했습니다.' })
  }
  return response(500, { ok: false, success: false, code: 'INTERNAL_ERROR', message: '사용자 역할 확인에 실패했습니다.' })
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return response(405, { ok: false, success: false, code: 'METHOD_NOT_ALLOWED', message: '허용되지 않은 요청 방식입니다.' })
  }

  const idToken = getBearerToken(event)
  if (!idToken) {
    return response(401, { ok: false, success: false, code: 'UNAUTHENTICATED', message: '로그인이 필요합니다.' })
  }

  try {
    const { adminAuth, adminDb } = getAdminServices()
    const decodedToken = await adminAuth.verifyIdToken(idToken)
    const uid = String(decodedToken.uid ?? '').trim()
    const email = String(decodedToken.email ?? '').trim().toLowerCase()
    if (!uid || !email || decodedToken.email_verified !== true) {
      return response(403, { ok: false, success: false, code: 'UNAUTHENTICATED', message: '확인된 Google 이메일이 필요합니다.' })
    }

    const teacherRef = adminDb.collection('teachers').doc(uid)
    const userRef = adminDb.collection('users').doc(uid)
    const role = await adminDb.runTransaction(async (transaction) => {
      const [teacherSnapshot, currentUserSnapshot] = await Promise.all([
        transaction.get(teacherRef),
        transaction.get(userRef),
      ])
      const resolvedRole = teacherSnapshot.exists && teacherSnapshot.data()?.active === true
        ? 'teacher'
        : 'student'
      const profile = {
        uid,
        email,
        displayName: String(decodedToken.name ?? ''),
        photoURL: String(decodedToken.picture ?? ''),
        role: resolvedRole,
        lastLoginAt: FieldValue.serverTimestamp(),
      }
      if (!currentUserSnapshot.exists) profile.createdAt = FieldValue.serverTimestamp()
      transaction.set(userRef, profile, { merge: true })
      return resolvedRole
    })

    return response(200, { ok: true, success: true, role, isTeacher: role === 'teacher' })
  } catch (error) {
    console.error('[Role Resolver] role resolution failed', {
      name: error?.name,
      code: error?.code,
      message: error?.message,
    })
    return errorResponse(error)
  }
}
