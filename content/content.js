// LSware 휴가신청 자동입력 Content Script

(async function() {
  'use strict';

  // 설정 불러오기
  const settings = await chrome.storage.local.get([
    'department',
    'team', 
    'name',
    'enabled',
    'reasonPresets',
    'defaultPresetIndex'
  ]);

  // 자동입력이 비활성화되어 있으면 종료
  if (settings.enabled === false) {
    console.log('[LSware 자동입력] 비활성화 상태입니다.');
    return;
  }

  const presets = settings.reasonPresets || [];
  const defaultPresetIndex = settings.defaultPresetIndex ?? -1;
  const defaultPreset = (defaultPresetIndex >= 0 && defaultPresetIndex < presets.length) 
    ? presets[defaultPresetIndex] 
    : null;

  // 입력 필드 셀렉터
  const SELECTORS = {
    title: [
      '#subject',
      'input[name="subject"]',
      'input[data-defaultstr=" 본부 / 팀명 / 이름 / 휴가일/일수"]',
      'input[data-defaultstr=" 본부 / 팀명 / 이름 / 휴가일자"]'
    ],
    reason: [
      '#editorForm_6',
      'textarea[name="editorForm_6"]',
      'textarea[data-defaultstr="(가급적 사유를 구체적으로 기재함)"]'
    ]
  };

  // Autocomplete UI 스타일 주입
  function injectStyles() {
    if (document.getElementById('lsware-autofill-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'lsware-autofill-styles';
    style.textContent = `
      .lsware-autocomplete {
        position: absolute;
        background: white;
        border: 1px solid #ddd;
        border-radius: 4px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        max-height: 200px;
        overflow-y: auto;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
      }
      
      .lsware-autocomplete-item {
        padding: 10px 14px;
        cursor: pointer;
        border-bottom: 1px solid #f0f0f0;
        transition: background 0.15s;
      }
      
      .lsware-autocomplete-item:last-child {
        border-bottom: none;
      }
      
      .lsware-autocomplete-item:hover,
      .lsware-autocomplete-item.selected {
        background: #e8f4fc;
      }
      
      .lsware-autocomplete-item.selected {
        background: #d0e8f7;
      }
      
      .lsware-autocomplete-empty {
        padding: 10px 14px;
        color: #999;
        text-align: center;
        font-size: 13px;
      }
    `;
    document.head.appendChild(style);
  }

  // Autocomplete 컴포넌트 클래스
  class Autocomplete {
    constructor(inputElement, items, defaultStr) {
      this.input = inputElement;
      this.items = items;
      this.defaultStr = defaultStr; // data-defaultstr 값 (무시할 기본값)
      this.filteredItems = items;
      this.selectedIndex = -1;
      this.dropdown = null;
      this.isOpen = false;
      
      this.init();
    }
    
    init() {
      // 이벤트 리스너 등록
      this.input.addEventListener('focus', () => this.onFocus());
      this.input.addEventListener('click', () => this.onFocus());
      this.input.addEventListener('blur', (e) => {
        // 드롭다운 클릭 시 blur 무시
        setTimeout(() => this.hide(), 150);
      });
      this.input.addEventListener('input', () => this.filter());
      this.input.addEventListener('keydown', (e) => this.handleKeydown(e));
      
      console.log('[LSware 자동입력] Autocomplete 이벤트 리스너 등록 완료');
    }
    
    onFocus() {
      console.log('[LSware 자동입력] Input focused, showing autocomplete');
      this.show();
    }
    
    createDropdown() {
      if (this.dropdown) return;
      
      this.dropdown = document.createElement('div');
      this.dropdown.className = 'lsware-autocomplete';
      document.body.appendChild(this.dropdown);
    }
    
    positionDropdown() {
      if (!this.dropdown) return;
      
      const rect = this.input.getBoundingClientRect();
      this.dropdown.style.top = `${rect.bottom + window.scrollY + 4}px`;
      this.dropdown.style.left = `${rect.left + window.scrollX}px`;
      this.dropdown.style.width = `${Math.max(rect.width, 250)}px`;
    }
    
    show() {
      if (this.items.length === 0) {
        console.log('[LSware 자동입력] 프리셋이 없어서 autocomplete 표시 안함');
        return;
      }
      
      this.createDropdown();
      this.filter();
      this.positionDropdown();
      this.isOpen = true;
      console.log('[LSware 자동입력] Autocomplete 표시됨');
    }
    
    hide() {
      if (this.dropdown) {
        this.dropdown.remove();
        this.dropdown = null;
      }
      this.isOpen = false;
      this.selectedIndex = -1;
    }
    
    // 현재 입력값이 기본값(defaultStr)인지 확인
    isDefaultValue(value) {
      return value === this.defaultStr;
    }
    
    filter() {
      // 필터링 없이 항상 전체 목록 표시
      this.filteredItems = this.items;
      this.selectedIndex = -1;
      this.render();
    }
    
    render() {
      if (!this.dropdown) return;
      
      this.dropdown.innerHTML = '';
      

      
      this.filteredItems.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'lsware-autocomplete-item';
        if (index === this.selectedIndex) {
          div.classList.add('selected');
        }
        div.textContent = item;
        
        div.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.select(index);
        });
        
        div.addEventListener('mouseenter', () => {
          this.selectedIndex = index;
          this.updateSelection();
        });
        
        this.dropdown.appendChild(div);
      });
    }
    
    updateSelection() {
      if (!this.dropdown) return;
      
      const items = this.dropdown.querySelectorAll('.lsware-autocomplete-item');
      items.forEach((item, index) => {
        item.classList.toggle('selected', index === this.selectedIndex);
      });
    }
    
    handleKeydown(e) {
      if (!this.isOpen) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          this.show();
          e.preventDefault();
        }
        return;
      }
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          this.selectedIndex = Math.min(
            this.selectedIndex + 1, 
            this.filteredItems.length - 1
          );
          this.updateSelection();
          this.scrollToSelected();
          break;
          
        case 'ArrowUp':
          e.preventDefault();
          this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
          this.updateSelection();
          this.scrollToSelected();
          break;
          
        case 'Enter':
          if (this.selectedIndex >= 0) {
            e.preventDefault();
            this.select(this.selectedIndex);
          }
          break;
          
        case 'Escape':
          this.hide();
          break;
      }
    }
    
    scrollToSelected() {
      if (!this.dropdown || this.selectedIndex < 0) return;
      
      const items = this.dropdown.querySelectorAll('.lsware-autocomplete-item');
      if (items[this.selectedIndex]) {
        items[this.selectedIndex].scrollIntoView({ block: 'nearest' });
      }
    }
    
    select(index) {
      if (index < 0 || index >= this.filteredItems.length) return;
      
      const value = this.filteredItems[index];
      this.input.value = value;
      
      // React/Vue 등 프레임워크 호환을 위한 이벤트 발생
      this.input.dispatchEvent(new Event('input', { bubbles: true }));
      this.input.dispatchEvent(new Event('change', { bubbles: true }));
      
      this.hide();
      console.log('[LSware 자동입력] 프리셋 선택됨:', value);
    }
  }

  // DOM이 완전히 로드될 때까지 대기하는 함수
  function findElement(selectors) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    for (const selector of selectorList) {
      const el = document.querySelector(selector);
      if (el) return el;
    }
    return null;
  }

  function waitForElement(selectors, timeout = 10000) {
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    return new Promise((resolve, reject) => {
      const element = findElement(selectorList);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver((mutations, obs) => {
        const el = findElement(selectorList);
        if (el) {
          obs.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      setTimeout(() => {
        observer.disconnect();
        reject(new Error(`Element not found: ${selectorList.join(' | ')}`));
      }, timeout);
    });
  }

  // .edit 클래스가 추가될 때까지 대기 (input이 활성화된 상태)
  function waitForEditableInput(selectors, timeout = 10000) {
    return waitForElement(selectors, timeout);
  }

  // 입력 필드에 값을 설정하고 이벤트 발생
  function setInputValue(element, value) {
    if (!element || value === undefined || value === null) return false;

    element.value = value;
    
    const inputEvent = new Event('input', { bubbles: true });
    const changeEvent = new Event('change', { bubbles: true });
    
    element.dispatchEvent(inputEvent);
    element.dispatchEvent(changeEvent);
    element.dispatchEvent(new Event('focus', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    return true;
  }

  // 메인 자동입력 로직
  async function autoFill() {
    console.log('[LSware 자동입력] 자동입력을 시작합니다...');
    console.log('[LSware 자동입력] 프리셋 개수:', presets.length);
    console.log('[LSware 자동입력] 기본 프리셋:', defaultPreset || '없음');

    // 스타일 주입
    injectStyles();

    try {
      // 제목 필드 입력
      if (settings.department || settings.team || settings.name) {
        const today = new Date();
        const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
        
        const titleParts = [
          settings.department,
          settings.team,
          settings.name,
          dateStr
        ].filter(Boolean);
        
        const titleValue = titleParts.join(' / ');
        
        const titleInput = await waitForEditableInput(SELECTORS.title);
        if (setInputValue(titleInput, titleValue)) {
          console.log('[LSware 자동입력] 제목 입력 완료:', titleValue);
        }
      }

      // 휴가사유 필드 처리
      if (presets.length > 0) {
        const reasonInput = await waitForEditableInput(SELECTORS.reason);
        const defaultStr = reasonInput.getAttribute('data-defaultstr') || '';
        
        // 기본 프리셋이 있으면 자동 입력
        if (defaultPreset) {
          if (setInputValue(reasonInput, defaultPreset)) {
            console.log('[LSware 자동입력] 기본 휴가사유 입력 완료:', defaultPreset);
          }
        }
        
        // Autocomplete 연결
        new Autocomplete(reasonInput, presets, defaultStr);
        console.log('[LSware 자동입력] 휴가사유 Autocomplete 활성화:', presets.length, '개 프리셋');
      } else {
        console.log('[LSware 자동입력] 등록된 프리셋이 없습니다.');
      }

      console.log('[LSware 자동입력] 초기화 완료');
    } catch (error) {
      console.error('[LSware 자동입력] 오류 발생:', error.message);
    }
  }

  // 페이지 로드 완료 후 약간의 지연을 두고 실행
  setTimeout(autoFill, 500);
})();
