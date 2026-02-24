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
    'defaultPresetIndex',
    'vacationStartDate',
    'vacationEndDate'
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
    ],
    startDate: ['#editorForm_7', 'input[name="editorForm_7"]'],
    endDate: ['#editorForm_8', 'input[name="editorForm_8"]'],
    durationDays: ['#editorForm_9', 'input[name="editorForm_9"]']
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


  function formatDateForTitle(date) {
    if (!(date instanceof Date)) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  }

  function normalizeDate(year, month, day) {
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return null;
    }
    return date;
  }

  function parseDateText(value) {
    if (!value) return null;

    const dateMatch = value.trim().match(/^(\d{4})[./-](\d{1,2})[./-](\d{1,2})$/);
    if (!dateMatch) return null;

    return normalizeDate(Number(dateMatch[1]), Number(dateMatch[2]), Number(dateMatch[3]));
  }

  function getDateFromInput(element) {
    if (!element) return null;

    const win = element.ownerDocument?.defaultView;
    const hasJqueryDatepicker = Boolean(
      win?.jQuery &&
      typeof win.jQuery === 'function' &&
      typeof win.jQuery(element).datepicker === 'function'
    );

    if (hasJqueryDatepicker) {
      const picked = win.jQuery(element).datepicker('getDate');
      if (picked instanceof Date && !Number.isNaN(picked.getTime())) {
        return normalizeDate(picked.getFullYear(), picked.getMonth() + 1, picked.getDate());
      }
    }

    return parseDateText(element.value);
  }

  function calculateDurationDays(startDate, endDate) {
    const msPerDay = 24 * 60 * 60 * 1000;
    const diff = Math.floor((endDate - startDate) / msPerDay);
    return diff + 1;
  }

  function setDateInputValue(element, date) {
    if (!element || !(date instanceof Date)) return false;

    const win = element.ownerDocument?.defaultView;
    const hasJqueryDatepicker = Boolean(
      win?.jQuery &&
      typeof win.jQuery === 'function' &&
      typeof win.jQuery(element).datepicker === 'function'
    );

    if (hasJqueryDatepicker) {
      win.jQuery(element).datepicker('setDate', date);
    } else {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      element.value = `${year}-${month}-${day}`;
    }

    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dispatchEvent(new Event('blur', { bubbles: true }));

    return true;
  }

  function buildTitle(startDate, durationDays) {
    const titleParts = [settings.department, settings.team, settings.name].filter(Boolean);

    if (startDate instanceof Date) {
      titleParts.push(formatDateForTitle(startDate));
    }

    if (durationDays && durationDays > 0) {
      titleParts.push(`${durationDays}일`);
    }

    return titleParts.join(' / ');
  }

  // 메인 자동입력 로직
  async function autoFill() {
    console.log('[LSware 자동입력] 자동입력을 시작합니다...');
    console.log('[LSware 자동입력] 프리셋 개수:', presets.length);
    console.log('[LSware 자동입력] 기본 프리셋:', defaultPreset || '없음');

    // 스타일 주입
    injectStyles();

    try {
      const [titleInput, startDateInput, endDateInput] = await Promise.all([
        waitForEditableInput(SELECTORS.title),
        waitForEditableInput(SELECTORS.startDate),
        waitForEditableInput(SELECTORS.endDate)
      ]);
      const durationInput = findElement(SELECTORS.durationDays);

      const updateDurationAndTitle = () => {
        const startDate = getDateFromInput(startDateInput);
        const endDate = getDateFromInput(endDateInput);

        let durationDays = null;
        if (startDate && endDate && startDate <= endDate) {
          durationDays = calculateDurationDays(startDate, endDate);
          if (durationInput) {
            setInputValue(durationInput, String(durationDays));
          }
        }

        const titleValue = buildTitle(startDate, durationDays);
        if (titleValue) {
          setInputValue(titleInput, titleValue);
        }
      };

      // 신청 당일 자동 입력
      const today = new Date();
      setDateInputValue(startDateInput, today);
      setDateInputValue(endDateInput, today);
      updateDurationAndTitle();
      console.log('[LSware 자동입력] 신청 당일 기준으로 휴가기간/제목 자동입력 완료');

      // 사용자가 기간 변경 시 일수와 제목 동기화
      ['input', 'change', 'blur'].forEach((eventName) => {
        startDateInput.addEventListener(eventName, updateDurationAndTitle);
        endDateInput.addEventListener(eventName, updateDurationAndTitle);
      });

      // 휴가 기간 자동입력 (설정된 경우)
      const startDate = parseIsoDate(settings.vacationStartDate);
      const endDate = parseIsoDate(settings.vacationEndDate);

      if (startDate && endDate && startDate <= endDate) {
        const [startDateInput, endDateInput] = await Promise.all([
          waitForEditableInput(SELECTORS.startDate),
          waitForEditableInput(SELECTORS.endDate)
        ]);

        setDateInputValue(startDateInput, startDate);
        setDateInputValue(endDateInput, endDate);

        const durationInput = findElement(SELECTORS.durationDays);
        if (durationInput) {
          setInputValue(durationInput, String(calculateDurationDays(startDate, endDate)));
        }

        console.log('[LSware 자동입력] 휴가 기간 입력 완료');
      } else if (settings.vacationStartDate || settings.vacationEndDate) {
        console.warn('[LSware 자동입력] 휴가 기간 설정값이 올바르지 않습니다.');
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
