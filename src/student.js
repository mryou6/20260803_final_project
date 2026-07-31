// 학생 페이지의 인증 상태를 확인한 뒤 기존 6단계 기획 화면을 시작합니다.
import './style.css'
import { observeAuthState, signOutUser } from './firebase/auth.js'
import { resolveUserRole, saveOrUpdateUser } from './firebase/userService.js'

const app = document.querySelector('#app')
const isDevelopmentPreview =
  import.meta.env.DEV && new URLSearchParams(window.location.search).get('preview') === '1'
let appInitialized = false

function showStudentAlert(message) {
  document.querySelector('.student-inline-alert')?.remove()
  const notice = document.createElement('div')
  notice.className = 'student-inline-alert'
  notice.setAttribute('role', 'alert')
  notice.textContent = message
  document.body.append(notice)
}

function renderAuthLoading() {
  app.innerHTML = `
    <main class="auth-loading-screen">
      <span class="loading-spinner" aria-hidden="true"></span>
      <p>로그인 상태를 확인하고 있습니다.</p>
    </main>
  `
}

async function startStudentApp(user) {
  if (appInitialized) return
  appInitialized = true
  if (user) {
    await saveOrUpdateUser(user)
    await resolveUserRole(user)
  }
  const { initializeApp } = await import('./main.js')
  initializeApp(user)
}

renderAuthLoading()

if (isDevelopmentPreview) {
  startStudentApp(null)
} else {
  observeAuthState((user) => {
    if (!user) {
      window.location.replace('/index.html')
      return
    }
    startStudentApp(user)
  })
}

document.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action="student-logout"]')
  if (!button) return

  button.disabled = true
  const result = await signOutUser()
  if (result.success) {
    window.location.replace('/index.html')
  } else {
    button.disabled = false
    showStudentAlert(result.error)
  }
})
