// 앱 진입 전에 OpenAI 서버 연결 상태를 확인하는 보안 게이트 화면입니다.
import {
  canEnterProtectedPage,
  canStartProject,
  normalizeServiceConnection,
} from '../utils/connectionState.js'
import { escapeHtml } from '../utils/helpers.js'

const statusIcons = {
  idle: '<span class="status-dot" aria-hidden="true"></span>',
  loading: '<span class="loading-spinner" aria-hidden="true"></span>',
  success:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  error:
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8v5m0 3.5v.1M10.3 4.6 3.1 17a2 2 0 0 0 1.7 3h14.4a2 2 0 0 0 1.7-3L13.7 4.6a2 2 0 0 0-3.4 0Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
}

export function renderStatusBadge(status, label) {
  const safeState = normalizeServiceConnection(
    { status, label },
    { status: 'idle', label: '상태 확인 필요' },
  )

  return `
    <span class="status-badge status-${safeState.status}">
      ${statusIcons[safeState.status] ?? statusIcons.idle}
      ${safeState.label}
    </span>
  `
}

export function createApiConnectionGate(connectionState = {}) {
  const openai = normalizeServiceConnection(connectionState.openai, {
    status: 'idle',
    label: '연결 확인 필요',
    message: '서버에 보관된 OpenAI API 연결 상태를 확인해 주세요.',
  })
  const firebase = normalizeServiceConnection(connectionState.firebase, {
    status: 'idle',
    label: '상태 확인 필요',
    message: 'Firebase 연결 상태를 확인해 주세요.',
  })
  const auth = {
    status: connectionState.auth?.status ?? 'checking',
    user: connectionState.auth?.user ?? null,
    message: connectionState.auth?.message ?? '',
  }
  const isLoading = openai.status === 'loading'
  const connectionsReady = canStartProject({ openai, firebase })
  const isConnected = canEnterProtectedPage({ openai, firebase, auth })
  const isSigningIn = auth.status === 'signing-in'
  const isSignedIn = auth.status === 'signed-in' && auth.user
  const roleState = {
    status: connectionState.userRole?.status ?? 'idle',
    role: connectionState.userRole?.role === 'teacher' ? 'teacher' : 'student',
    message: connectionState.userRole?.message ?? '',
  }
  const roleReady = isSignedIn && roleState.status === 'ready'
  const roleLabel = roleState.role === 'teacher' ? '교사' : '학생'
  const displayName = escapeHtml(auth.user?.displayName || '사용자')
  const email = escapeHtml(auth.user?.email || '')
  const avatar = auth.user?.photoURL
    ? `<img src="${escapeHtml(auth.user.photoURL)}" alt="${displayName} 프로필" referrerpolicy="no-referrer" />`
    : `<span>${displayName.charAt(0) || 'U'}</span>`

  return `
    <main class="connection-gate">
      <div class="gate-background" aria-hidden="true">
        <span></span><span></span><span></span>
      </div>
      <section class="connection-card" aria-labelledby="connection-title">
        <div class="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 32 32"><path d="M8 12h16v8H8zM12 8v4m8-4v4m-8 8v4m8-4v4M4 14h4m16 0h4M4 18h4m16 0h4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="13" cy="16" r="1.3" fill="currentColor"/><circle cx="19" cy="16" r="1.3" fill="currentColor"/></svg>
        </div>
        <p class="gate-eyebrow">SECURE AI CONNECTION</p>
        <h1 id="connection-title">Arduino Project<br />Studio <em>AI</em></h1>
        <p class="gate-description">생성형 AI 기반 아두이노 프로젝트 기획 및 제작 지원 플랫폼</p>

        <div class="connection-panel">
          <div class="service-status-list">
            <div class="connection-status-row">
              <span>OpenAI API 연결 상태</span>
              ${renderStatusBadge(openai.status, openai.label)}
            </div>
            <div class="connection-status-row">
              <span>Firebase 연결 상태</span>
              ${renderStatusBadge(firebase.status, firebase.label)}
            </div>
          </div>

          <div class="connection-message ${openai.status === 'error' ? 'is-error' : ''}" aria-live="polite">
            <span class="message-icon">${statusIcons[openai.status] ?? statusIcons.idle}</span>
            <p>${openai.message}</p>
          </div>
          <div class="firebase-message ${firebase.status === 'error' ? 'is-error' : ''}" role="status">
            ${statusIcons[firebase.status] ?? statusIcons.idle}
            <p>${firebase.message}</p>
          </div>

          <button class="gate-button gate-button-primary" type="button" data-action="check-connection" ${isLoading ? 'disabled' : ''}>
            ${isLoading ? `${statusIcons.loading} 연결 확인 중...` : 'OpenAI 연결 확인'}
          </button>
          ${
            isSignedIn
              ? `<div class="auth-user-card">
                  <div class="auth-user-avatar">${avatar}</div>
                  <div><strong>${displayName}</strong>${roleReady ? `<span class="auth-role-badge role-${roleState.role}">${roleLabel}</span>` : ''}<span>${email}</span></div>
                  <button type="button" data-action="sign-out">로그아웃</button>
                </div>`
              : `<button class="google-login-button" type="button" data-action="google-sign-in" ${connectionsReady && !isSigningIn && auth.status !== 'checking' ? '' : 'disabled'}>
                  <span class="google-icon" aria-hidden="true">G</span>
                  ${isSigningIn ? `${statusIcons.loading} Google 로그인 중...` : 'Google 계정으로 로그인'}
                </button>`
          }
          ${auth.message && auth.status === 'error' ? `<p class="auth-error-message" role="alert">${escapeHtml(auth.message)}</p>` : ''}
          ${isSignedIn && !roleReady ? `<div class="role-checking" role="status">${statusIcons.loading}<span>${escapeHtml(roleState.message || '사용자 권한을 확인하고 있습니다.')}</span></div>` : ''}
          ${roleReady && roleState.role === 'student' ? `
            <section class="role-entry-panel role-entry-student">
              <span class="auth-role-badge role-student">학생</span>
              <h2>학생 프로젝트 설계 공간</h2>
              <p>아이디어를 단계별 기획안으로 발전시키고 저장·제출할 수 있습니다.</p>
              <div class="role-entry-actions">
                <button class="gate-button gate-button-start" type="button" data-action="start-project" ${isConnected ? '' : 'disabled'}>프로젝트 시작</button>
                <button class="gate-button gate-button-secondary" type="button" data-action="open-my-projects" ${isConnected ? '' : 'disabled'}>내 프로젝트 보기</button>
              </div>
            </section>` : ''}
          ${roleReady && roleState.role === 'teacher' ? `
            <section class="role-entry-panel role-entry-teacher">
              <span class="auth-role-badge role-teacher">교사</span>
              <h2>교사 프로젝트 관리 공간</h2>
              <p>학생들의 기획 진행 상황과 제출 결과를 확인할 수 있습니다.</p>
              <div class="role-entry-actions role-entry-actions-single">
                <button class="gate-button gate-button-start" type="button" data-action="open-teacher" aria-label="학생 프로젝트 모니터링 대시보드 열기" ${isConnected ? '' : 'disabled'}>학생 프로젝트 모니터링</button>
              </div>
            </section>` : ''}
          ${roleState.status === 'error' ? `<p class="auth-error-message" role="alert">${escapeHtml(roleState.message)}</p>` : ''}
        </div>

        <div class="security-note">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2m-11 0h12v10H6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <p>OpenAI API Key는 브라우저에 입력하거나 저장하지 않으며, Netlify 서버 환경변수를 통해 안전하게 사용합니다.</p>
        </div>
      </section>
      <p class="gate-footer">API Key는 이 브라우저로 전송되지 않습니다.</p>
    </main>
  `
}
