// DOM 요소 참조
const departmentInput = document.getElementById('department');
const teamInput = document.getElementById('team');
const nameInput = document.getElementById('name');
const enabledCheckbox = document.getElementById('enabled');
const saveBasicButton = document.getElementById('saveBasic');
const newPresetInput = document.getElementById('newPreset');
const addPresetButton = document.getElementById('addPreset');
const presetList = document.getElementById('presetList');
const emptyMessage = document.getElementById('emptyMessage');
const statusDiv = document.getElementById('status');

// 프리셋 데이터
let presets = [];
let defaultPresetIndex = -1; // 기본값 인덱스 (-1이면 기본값 없음)

// 저장된 설정 불러오기
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get([
      'department',
      'team',
      'name',
      'enabled',
      'reasonPresets',
      'defaultPresetIndex'
    ]);
    
    departmentInput.value = result.department || '';
    teamInput.value = result.team || '';
    nameInput.value = result.name || '';
    enabledCheckbox.checked = result.enabled !== false;
    presets = result.reasonPresets || [];
    defaultPresetIndex = result.defaultPresetIndex ?? -1;
    
    // 유효하지 않은 인덱스 보정
    if (defaultPresetIndex >= presets.length) {
      defaultPresetIndex = -1;
    }
    
    renderPresets();
  } catch (error) {
    showStatus('설정을 불러오는데 실패했습니다.', 'error');
  }
}

// 기본 정보 저장
async function saveBasicSettings() {
  try {
    await chrome.storage.local.set({
      department: departmentInput.value.trim(),
      team: teamInput.value.trim(),
      name: nameInput.value.trim(),
      enabled: enabledCheckbox.checked
    });
    
    showStatus('기본 정보가 저장되었습니다!', 'success');
  } catch (error) {
    showStatus('저장에 실패했습니다.', 'error');
  }
}

// 프리셋 저장
async function savePresets() {
  try {
    await chrome.storage.local.set({ 
      reasonPresets: presets,
      defaultPresetIndex: defaultPresetIndex
    });
  } catch (error) {
    showStatus('프리셋 저장에 실패했습니다.', 'error');
  }
}

// 프리셋 추가
async function addPreset() {
  const value = newPresetInput.value.trim();
  if (!value) {
    showStatus('휴가사유를 입력해주세요.', 'error');
    return;
  }
  
  if (presets.includes(value)) {
    showStatus('이미 등록된 휴가사유입니다.', 'error');
    return;
  }
  
  presets.push(value);
  await savePresets();
  newPresetInput.value = '';
  renderPresets();
  showStatus('프리셋이 추가되었습니다!', 'success');
}

// 프리셋 삭제
async function deletePreset(index) {
  presets.splice(index, 1);
  
  // 기본값 인덱스 조정
  if (defaultPresetIndex === index) {
    defaultPresetIndex = -1;
  } else if (defaultPresetIndex > index) {
    defaultPresetIndex--;
  }
  
  await savePresets();
  renderPresets();
  showStatus('프리셋이 삭제되었습니다.', 'success');
}

// 기본값 설정/해제
async function toggleDefault(index) {
  if (defaultPresetIndex === index) {
    defaultPresetIndex = -1; // 해제
  } else {
    defaultPresetIndex = index; // 설정
  }
  await savePresets();
  renderPresets();
}

// 프리셋 수정 모드 진입
function enterEditMode(index) {
  renderPresets(index);
}

// 프리셋 수정 저장
async function saveEdit(index, newValue) {
  const value = newValue.trim();
  if (!value) {
    showStatus('휴가사유를 입력해주세요.', 'error');
    return;
  }
  
  // 중복 체크 (자기 자신 제외)
  const duplicate = presets.findIndex((p, i) => p === value && i !== index);
  if (duplicate !== -1) {
    showStatus('이미 등록된 휴가사유입니다.', 'error');
    return;
  }
  
  presets[index] = value;
  await savePresets();
  renderPresets();
  showStatus('프리셋이 수정되었습니다!', 'success');
}

// 프리셋 목록 렌더링
function renderPresets(editIndex = -1) {
  presetList.innerHTML = '';
  
  if (presets.length === 0) {
    emptyMessage.classList.add('show');
    return;
  }
  
  emptyMessage.classList.remove('show');
  
  presets.forEach((preset, index) => {
    const li = document.createElement('li');
    li.className = 'preset-item';
    
    const isDefault = index === defaultPresetIndex;
    if (isDefault) {
      li.classList.add('is-default');
    }
    
    if (index === editIndex) {
      // 수정 모드
      li.innerHTML = `
        <input type="text" class="edit-input" value="${escapeHtml(preset)}">
        <div class="preset-actions">
          <button class="btn-icon btn-save" data-index="${index}">저장</button>
          <button class="btn-icon btn-cancel">취소</button>
        </div>
      `;
      
      const input = li.querySelector('.edit-input');
      const saveBtn = li.querySelector('.btn-save');
      const cancelBtn = li.querySelector('.btn-cancel');
      
      // 자동 포커스
      setTimeout(() => input.focus(), 0);
      
      // Enter 키로 저장
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') saveEdit(index, input.value);
        if (e.key === 'Escape') renderPresets();
      });
      
      saveBtn.addEventListener('click', () => saveEdit(index, input.value));
      cancelBtn.addEventListener('click', () => renderPresets());
    } else {
      // 보기 모드
      li.innerHTML = `
        <button class="btn-icon btn-default ${isDefault ? 'active' : ''}" data-index="${index}" title="${isDefault ? '기본값 해제' : '기본값으로 설정'}">
          ${isDefault ? '★' : '☆'}
        </button>
        <span class="preset-text">${escapeHtml(preset)}</span>
        <div class="preset-actions">
          <button class="btn-icon btn-edit" data-index="${index}">수정</button>
          <button class="btn-icon btn-delete" data-index="${index}">삭제</button>
        </div>
      `;
      
      const defaultBtn = li.querySelector('.btn-default');
      const editBtn = li.querySelector('.btn-edit');
      const deleteBtn = li.querySelector('.btn-delete');
      
      defaultBtn.addEventListener('click', () => toggleDefault(index));
      editBtn.addEventListener('click', () => enterEditMode(index));
      deleteBtn.addEventListener('click', () => deletePreset(index));
    }
    
    presetList.appendChild(li);
  });
}

// HTML 이스케이프
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 상태 메시지 표시
function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  
  setTimeout(() => {
    statusDiv.className = 'status';
  }, 2000);
}

// 이벤트 리스너
saveBasicButton.addEventListener('click', saveBasicSettings);
addPresetButton.addEventListener('click', addPreset);
newPresetInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') addPreset();
});

// 페이지 로드 시 설정 불러오기
document.addEventListener('DOMContentLoaded', loadSettings);
