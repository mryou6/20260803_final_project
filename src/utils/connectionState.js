// OpenAI와 Firebase 연결 상태를 일관된 중첩 객체 구조로 생성하고 갱신합니다.
export const CONNECTION_STATUSES = ['idle', 'loading', 'success', 'error']
export const AUTH_STATUSES = ['checking', 'signed-out', 'signing-in', 'signed-in', 'error']

export function normalizeServiceConnection(serviceState = {}, fallback = {}) {
  const status = CONNECTION_STATUSES.includes(serviceState?.status)
    ? serviceState.status
    : CONNECTION_STATUSES.includes(fallback.status)
      ? fallback.status
      : 'idle'

  return {
    status,
    label: serviceState?.label ?? fallback.label ?? '상태 확인 필요',
    message: serviceState?.message ?? fallback.message ?? '',
  }
}

export function createInitialConnectionState() {
  return {
    openai: {
      status: 'idle',
      label: '연결 확인 필요',
      message: '서버에 보관된 OpenAI API 연결 상태를 확인해 주세요.',
    },
    firebase: {
      status: 'loading',
      label: '설정 확인 중',
      message: 'Firebase SDK 설정을 확인하고 있습니다.',
    },
    auth: {
      status: 'checking',
      user: null,
      message: '로그인 상태를 확인하고 있습니다.',
    },
    userRole: {
      status: 'idle',
      role: null,
      message: '',
    },
  }
}

export function updateAuthState(appState, nextAuthState = {}) {
  const previousAuth = appState?.auth ?? {}
  const status = AUTH_STATUSES.includes(nextAuthState.status)
    ? nextAuthState.status
    : AUTH_STATUSES.includes(previousAuth.status)
      ? previousAuth.status
      : 'checking'

  return {
    ...appState,
    auth: {
      status,
      user: nextAuthState.user === undefined ? previousAuth.user ?? null : nextAuthState.user,
      message: nextAuthState.message ?? previousAuth.message ?? '',
    },
  }
}

export function updateServiceConnection(connectionState, serviceName, nextState) {
  if (!['openai', 'firebase'].includes(serviceName)) return connectionState

  return {
    ...connectionState,
    [serviceName]: normalizeServiceConnection(nextState, connectionState[serviceName]),
  }
}

export function canStartProject(connectionState) {
  return (
    connectionState?.openai?.status === 'success' &&
    connectionState?.firebase?.status === 'success'
  )
}

export function canEnterProtectedPage(appState) {
  return canStartProject(appState) && appState?.auth?.status === 'signed-in' && Boolean(appState.auth.user)
}
