// 현재 세션의 기획안을 메모리에 임시 보관하는 모듈입니다.
let draftSnapshot = null

export function saveDraftToMemory(projectState) {
  draftSnapshot = structuredClone(projectState)
  return draftSnapshot
}

export function getMemoryDraft() {
  return draftSnapshot
}
