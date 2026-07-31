// Firebase ID 토큰을 검증하고 사전 승인된 교사 이메일에 따라 사용자 역할을 서버에서 결정합니다.
import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore } from 'firebase-admin/firestore'

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
}

const response = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
})

function getServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    return {
      projectId: account.project_id,
      clientEmail: account.client_email,
      privateKey: account.private_key,
    }
  }

  if (
    process.env.FIREBASE_ADMIN_PROJECT_ID
    && process.env.FIREBASE_ADMIN_CLIENT_EMAIL
    && process.env.FIREBASE_ADMIN_PRIVATE_KEY
  ) {
    return {
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }
  }

  throw new Error('FIREBASE_ADMIN_CONFIG_MISSING')
}

function getAdminServices() {
  const app = getApps()[0] ?? initializeApp({ credential: cert(getServiceAccount()) })
  return { adminAuth: getAuth(app), adminDb: getFirestore(app) }
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') {
    return response(405, { success: false, message: '허용되지 않은 요청 방식입니다.' })
  }

  try {
    const authorization = event.headers?.authorization ?? event.headers?.Authorization ?? ''
    const idToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : ''
    if (!idToken) return response(401, { success: false, message: '로그인 정보가 필요합니다.' })

    const { adminAuth, adminDb } = getAdminServices()
    const decodedToken = await adminAuth.verifyIdToken(idToken)
    const email = String(decodedToken.email ?? '').trim().toLowerCase()
    if (!decodedToken.uid || !email || decodedToken.email_verified !== true) {
      return response(403, { success: false, message: '확인된 Google 이메일이 필요합니다.' })
    }

    const teacherSnapshot = await adminDb.collection('teachers').doc(decodedToken.uid).get()
    const userRef = adminDb.collection('users').doc(decodedToken.uid)
    const role = await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(userRef)
      const resolvedRole = teacherSnapshot.exists && teacherSnapshot.data()?.active === true ? 'teacher' : 'student'
      const profile = {
        uid: decodedToken.uid,
        email,
        displayName: String(decodedToken.name ?? ''),
        photoURL: String(decodedToken.picture ?? ''),
        role: resolvedRole,
        lastLoginAt: FieldValue.serverTimestamp(),
      }
      if (!current.exists) profile.createdAt = FieldValue.serverTimestamp()
      transaction.set(userRef, profile, { merge: true })
      return resolvedRole
    })

    return response(200, { success: true, role })
  } catch (error) {
    console.error('[Role Resolver] 역할 확인 실패', {
      name: error?.name,
      code: error?.code,
    })
    return response(500, {
      success: false,
      message: '사용자 권한을 확인하지 못했습니다.',
    })
  }
}
