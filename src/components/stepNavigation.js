// 여섯 개 작성 단계를 보여 주고 완료한 단계로 이동할 수 있게 합니다.
export function createStepNavigation(sections, currentStep, maxVisitedStep) {
  const items = sections
    .map((section, index) => {
      const step = index + 1
      const isAvailable = step <= maxVisitedStep
      const stateClass = step === currentStep ? 'is-current' : step < currentStep ? 'is-complete' : ''

      return `
        <li>
          <button
            class="step-button ${stateClass}"
            type="button"
            data-action="go-step"
            data-step="${step}"
            ${isAvailable ? '' : 'disabled'}
            ${step === currentStep ? 'aria-current="step"' : ''}
          >
            <span class="step-number">${step}</span>
            <span>${section.shortTitle}</span>
          </button>
        </li>
      `
    })
    .join('')

  return `<nav class="step-navigation" aria-label="기획안 작성 단계"><ol>${items}</ol></nav>`
}
