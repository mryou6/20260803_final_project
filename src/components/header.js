// 서비스 소개와 현재 작성 단계 및 전체 진행률을 표시합니다.
export function createHeader(currentStep, totalSteps, stepTitle) {
  const progress = Math.round((currentStep / totalSteps) * 100)

  return `
    <header class="app-header">
      <div class="header-copy">
        <p class="eyebrow">ARDUINO PROJECT STUDIO</p>
        <h1>Arduino Project Studio AI</h1>
        <p class="subtitle">생성형 AI 기반 아두이노 프로젝트 기획 및 제작 지원 플랫폼</p>
      </div>
      <div class="progress-card" aria-label="기획안 작성 진행률">
        <div class="progress-meta">
          <span><strong>${currentStep}단계</strong> · ${stepTitle}</span>
          <span>${progress}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-value" style="width: ${progress}%"></div>
        </div>
      </div>
    </header>
  `
}
