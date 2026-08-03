import { escapeHtml } from '../utils/helpers.js'

let closeTimer = null

export function dismissToast() {
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = null
  document.querySelector('[data-toast-region]')?.remove()
}

export function showToast({ type = 'info', title, message, duration = 3500 }) {
  dismissToast()

  const region = document.createElement('div')
  region.className = `app-toast app-toast-${type}`
  region.dataset.toastRegion = ''
  region.setAttribute('role', type === 'error' ? 'alert' : 'status')
  region.setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite')
  region.setAttribute('aria-atomic', 'true')
  region.innerHTML = `
    <span class="app-toast-icon" aria-hidden="true">${type === 'success' ? '✓' : type === 'error' ? '!' : 'i'}</span>
    <div class="app-toast-copy">
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
    </div>
    <button type="button" class="app-toast-close" aria-label="알림 닫기">×</button>
  `
  region.querySelector('.app-toast-close')?.addEventListener('click', dismissToast)
  document.body.append(region)

  if (duration > 0) closeTimer = setTimeout(dismissToast, duration)
}
