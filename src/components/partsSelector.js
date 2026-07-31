import { escapeHtml } from '../utils/helpers.js'

const availabilityOptions = [
  ['owned', '보유'], ['purchase', '구매 필요'], ['check', '확인 필요'],
]

function partRow(part) {
  return `<article class="hardware-part-card">
    <div class="hardware-part-card-heading"><strong>${escapeHtml(part.name || '기타 부품')}</strong><button class="icon-button" type="button" data-action="remove-part" data-id="${part.id}">삭제</button></div>
    <div class="hardware-part-fields">
      <label><span>구분</span><select data-part-field="category" data-part-id="${part.id}"><option value="input" ${part.category === 'input' ? 'selected' : ''}>입력</option><option value="output" ${part.category === 'output' ? 'selected' : ''}>출력</option><option value="other" ${part.category === 'other' ? 'selected' : ''}>기타</option></select></label>
      ${part.isCustom ? `<label><span>부품명</span><input data-part-field="name" data-part-id="${part.id}" value="${escapeHtml(part.name)}" placeholder="부품명"/></label>` : ''}
      <label><span>수량</span><input type="number" min="1" data-part-field="quantity" data-part-id="${part.id}" value="${part.quantity}"/></label>
      <label class="part-role-field"><span>작품에서 담당하는 역할 <small>(선택)</small></span><input data-part-field="role" data-part-id="${part.id}" value="${escapeHtml(part.role)}" placeholder="연결표에 작성했다면 생략할 수 있습니다"/></label>
      <label><span>보유 여부</span><select data-part-field="availability" data-part-id="${part.id}">${availabilityOptions.map(([value,label]) => `<option value="${value}" ${part.availability === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
    </div>
  </article>`
}

function partChoices(title, category, options, selected) {
  return `<fieldset class="part-group parts-column"><legend>${title}</legend><div class="part-choice-grid parts-grid">${options.map((name) => {
    const isOther = name === '기타 직접 입력'
    const checked = selected.some((part) => part.category === category && part.isActive !== false && (isOther ? part.isCustom : part.name === name && !part.isCustom))
    return `<label class="part-check part-option ${checked ? 'is-selected' : ''}"><input type="checkbox" data-action="toggle-part" data-category="${category}" value="${name}" ${checked ? 'checked' : ''}/><span>${name}</span></label>`
  }).join('')}</div></fieldset>`
}

export function createPartsSelector(state, boards, parts, errors = {}) {
  return `<form id="hardware-form" class="project-form hardware-form" novalidate>
    <div class="design-divider"><h3>보드와 부품 선택</h3><p>연결표에 작성한 기능을 구현할 보드와 부품을 선택하세요.</p></div>
    <label class="field"><span>사용 보드 <b>*</b></span><select name="hardware.board" required><option value="">보드를 선택하세요</option>${boards.map((board) => `<option value="${board}" ${state.hardware.board === board ? 'selected' : ''}>${board}</option>`).join('')}</select>${errors['hardware.board'] ? `<p class="field-error">${errors['hardware.board']}</p>` : ''}</label>
    ${state.hardware.board === '기타 직접 입력' ? `<label class="field"><span>기타 보드명 <b>*</b></span><input name="hardware.customBoard" value="${escapeHtml(state.hardware.customBoard)}" placeholder="보드명을 입력하세요"/></label>` : ''}
    <div class="hardware-grid parts-columns">${partChoices('입력 부품','input',parts.input,state.hardware.parts)}${partChoices('출력 부품','output',parts.output,state.hardware.parts)}</div>
    <div class="field field-wide"><div class="field-heading"><span>선택한 부품 정보</span><button class="text-button" type="button" data-action="add-custom-part">+ 기타 부품 추가</button></div>
      <div class="hardware-part-cards">${state.hardware.parts.filter((part) => part.isActive !== false).map(partRow).join('') || '<p class="empty-copy">아직 선택한 부품이 없습니다.</p>'}</div>
      ${errors['hardware.parts'] ? `<p class="field-error">${errors['hardware.parts']}</p>` : ''}
    </div>
    <div class="form-grid">
      <label class="field field-wide"><span>핀 또는 전원 관련 주의사항</span><textarea name="hardware.pinConditions" rows="3" placeholder="별도 전원, 드라이버, 핀 사용 조건 등을 함께 작성하세요">${escapeHtml(state.hardware.pinConditions || state.hardware.powerRequirements || state.hardware.driverRequirements)}</textarea></label>
    </div>
  </form>`
}
