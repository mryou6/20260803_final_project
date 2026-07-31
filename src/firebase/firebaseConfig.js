// Vite 환경변수로 Firebase 앱, 인증, Firestore 인스턴스를 안전하게 초기화합니다.
import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const viteEnvironment = import.meta.env ?? {}
const environmentVariables = {
  VITE_FIREBASE_API_KEY: viteEnvironment.VITE_FIREBASE_API_KEY,
  VITE_FIREBASE_AUTH_DOMAIN: viteEnvironment.VITE_FIREBASE_AUTH_DOMAIN,
  VITE_FIREBASE_PROJECT_ID: viteEnvironment.VITE_FIREBASE_PROJECT_ID,
  VITE_FIREBASE_STORAGE_BUCKET: viteEnvironment.VITE_FIREBASE_STORAGE_BUCKET,
  VITE_FIREBASE_MESSAGING_SENDER_ID: viteEnvironment.VITE_FIREBASE_MESSAGING_SENDER_ID,
  VITE_FIREBASE_APP_ID: viteEnvironment.VITE_FIREBASE_APP_ID,
  VITE_FIREBASE_MEASUREMENT_ID: viteEnvironment.VITE_FIREBASE_MEASUREMENT_ID,
}

const requiredEnvironmentVariables = Object.entries(environmentVariables)
  .filter(([name]) => name !== 'VITE_FIREBASE_MEASUREMENT_ID')

const missingEnvironmentVariables = requiredEnvironmentVariables
  .filter(([, value]) => !String(value ?? '').trim())
  .map(([name]) => name)

export const firebaseConfig = {
  apiKey: environmentVariables.VITE_FIREBASE_API_KEY,
  authDomain: environmentVariables.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: environmentVariables.VITE_FIREBASE_PROJECT_ID,
  storageBucket: environmentVariables.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: environmentVariables.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: environmentVariables.VITE_FIREBASE_APP_ID,
  measurementId: environmentVariables.VITE_FIREBASE_MEASUREMENT_ID,
}

export let app = null
export let auth = null
export let db = null

let firebaseReady = false

if (missingEnvironmentVariables.length) {
  console.warn(
    `Firebase 초기화에 필요한 환경변수가 누락되었습니다: ${missingEnvironmentVariables.join(', ')}`,
  )
} else {
  try {
    app = initializeApp(firebaseConfig)
    auth = getAuth(app)
    db = getFirestore(app)
    firebaseReady = true
  } catch (error) {
    app = null
    auth = null
    db = null
    console.error('Firebase 초기화에 실패했습니다.', {
      name: error?.name,
      code: error?.code,
    })
  }
}

export function isFirebaseReady() {
  return firebaseReady
}
