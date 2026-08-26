// Custom Vanilla JS Date Picker
const pickerPopup = document.createElement('div');
pickerPopup.className = 'custom-date-picker';
pickerPopup.innerHTML = '' + `
  <div class="cdp-header stagger-item">
    <button type="button" class="cdp-prev">&lt;</button>
    <div class="cdp-month"></div>
    <button type="button" class="cdp-next">&gt;</button>
  </div>
  <div class="cdp-days-header stagger-item">
    <span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span>
  </div>
  <div class="cdp-grid-wrapper stagger-item">
    <div class="cdp-highlight"></div>
    <div class="cdp-grid"></div>
  </div>
  <div class="cdp-footer stagger-item">
    <span class="cdp-range-hint" style="font-size:0.7rem; color:rgba(255,255,255,0.5); flex:1; text-align:left;"></span>
    <button type="button" class="cdp-today">今日</button>
  </div>
`;
document.body.appendChild(pickerPopup);

let currentInput = null;
let viewDate = new Date();
let isRangeMode = false;
let rangeStart = null;
let rangeEnd = null;
let _pickerJustOpened = false;

// updateHighlight removed in favor of pure CSS classes

function getDatesInRange(startStr, endStr) {
  const dates = [];
  let curr = new Date(startStr + 'T00:00:00');
  let end = new Date(endStr + 'T00:00:00');
  if (curr > end) { let tmp = curr; curr = end; end = tmp; }
  while (curr <= end) {
    const y = curr.getFullYear();
    const m = String(curr.getMonth() + 1).padStart(2, '0');
    const d = String(curr.getDate()).padStart(2, '0');
    dates.push(`${y}-${m}-${d}`);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

function updateRangeHint() {
  const hint = pickerPopup.querySelector('.cdp-range-hint');
  if (!hint) return;
  if (isRangeMode) {
    hint.textContent = rangeStart ? `開始: ${rangeStart} → 終了を選択` : '期間を選択';
  } else {
    hint.textContent = '';
  }
}

function renderPicker() {
  const monthEl = pickerPopup.querySelector('.cdp-month');
  const gridEl  = pickerPopup.querySelector('.cdp-grid');

  // Guard: viewDate might be Invalid Date
  if (isNaN(viewDate.getTime())) viewDate = new Date();

  monthEl.textContent = `${viewDate.getFullYear()}年 ${viewDate.getMonth() + 1}月`;

  const year  = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay    = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  gridEl.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('button');
    empty.className = 'cdp-day empty';
    empty.disabled = true;
    gridEl.appendChild(empty);
  }

  const todayStr    = new Date().toISOString().split('T')[0];
  const selectedStrs = currentInput && currentInput.value
    ? currentInput.value.split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s))
    : [];
  let selectedBtn = null;

  const isHoverRange = isRangeMode && rangeStart && !rangeEnd;
  const rangeStartDate = rangeStart ? new Date(rangeStart + 'T00:00:00') : null;

  for (let i = 1; i <= daysInMonth; i++) {
    const btn  = document.createElement('button');
    btn.type   = 'button';
    btn.className = 'cdp-day';
    btn.textContent = i;

    const dStr = ${year}--;
    const btnDate = new Date(dStr + 'T00:00:00');
    btn.dataset.date = dStr;

    if (dStr === todayStr) btn.classList.add('today');

    if (isRangeMode) {
      if (rangeStart) {
        if (rangeStart === dStr) { btn.classList.add('selected', 'range-start'); }
      } else {
        if (selectedStrs.length > 0) {
          const first = selectedStrs[0];
          const last = selectedStrs[selectedStrs.length - 1];
          if (dStr === first) btn.classList.add('selected', 'range-start');
          if (dStr === last) btn.classList.add('selected', 'range-end');
          if (selectedStrs.includes(dStr) && dStr !== first && dStr !== last) {
            btn.classList.add('range-between');
          }
        }
      }
    } else {
      if (selectedStrs.includes(dStr)) { btn.classList.add('selected'); }
    }

    if (isHoverRange) {
      btn.addEventListener('mouseover', () => {
        const hoverDate = btnDate;
        const start = rangeStartDate < hoverDate ? rangeStartDate : hoverDate;
        const end = rangeStartDate > hoverDate ? rangeStartDate : hoverDate;
        
        Array.from(gridEl.children).forEach(child => {
          if (!child.dataset.date) return;
          const childDate = new Date(child.dataset.date + 'T00:00:00');
          child.classList.remove('range-between', 'range-end', 'range-start');
          if (child.dataset.date === rangeStart) {
             child.classList.add('selected', rangeStartDate <= hoverDate ? 'range-start' : 'range-end');
          } else if (child.dataset.date === dStr) {
             child.classList.add('selected', rangeStartDate <= hoverDate ? 'range-end' : 'range-start');
          } else if (childDate > start && childDate < end) {
             child.classList.remove('selected');
             child.classList.add('range-between');
          } else {
             child.classList.remove('selected');
          }
        });
      });
    }

    btn.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent blur on input
      if (!isRangeMode) {
        if (currentInput) {
          currentInput.value = dStr;
          currentInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        
        setTimeout(() => hidePicker(), 150);
      } else {
        if (!rangeStart) {
          rangeStart = dStr;
          updateRangeHint();
          renderPicker();
        } else {
          rangeEnd = dStr;
          const dates = getDatesInRange(rangeStart, rangeEnd);
          if (currentInput) {
            currentInput.value = dates.join(',');
            currentInput.dispatchEvent(new Event('change', { bubbles: true }));
          }
          rangeStart = null;
          rangeEnd   = null;
          updateRangeHint();
          setTimeout(() => hidePicker(), 150);
        }
      }
    });
    gridEl.appendChild(btn);
  }

  
  updateRangeHint();
}

pickerPopup.querySelector('.cdp-prev').addEventListener('mousedown', e => {
  e.preventDefault();
  viewDate.setMonth(viewDate.getMonth() - 1);
  renderPicker();
});
pickerPopup.querySelector('.cdp-next').addEventListener('mousedown', e => {
  e.preventDefault();
  viewDate.setMonth(viewDate.getMonth() + 1);
  renderPicker();
});
pickerPopup.querySelector('.cdp-today').addEventListener('mousedown', e => {
  e.preventDefault();
  viewDate = new Date();
  if (!isRangeMode && currentInput) {
    currentInput.value = viewDate.toISOString().split('T')[0];
    currentInput.dispatchEvent(new Event('change', { bubbles: true }));
    setTimeout(() => hidePicker(), 150);
  }
  renderPicker();
});

function positionPicker(inputEl) {
  const rect = inputEl.getBoundingClientRect();
  let top  = rect.bottom + window.scrollY + 8;
  let left = rect.left + window.scrollX;

  // Clamp to viewport
  const pw = pickerPopup.offsetWidth || 280;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (left < 8) left = 8;

  pickerPopup.style.top  = `${top}px`;
  pickerPopup.style.left = `${left}px`;
}

function showPicker(inputEl) {
  currentInput  = inputEl;
  isRangeMode   = inputEl.dataset.range === 'true';
  rangeStart    = null;
  rangeEnd      = null;

  const firstVal = (inputEl.value || '').split(',')[0].trim();
  viewDate = (firstVal && /^\d{4}-\d{2}-\d{2}$/.test(firstVal))
    ? new Date(firstVal + 'T00:00:00')
    : new Date();

  renderPicker();
  positionPicker(inputEl);
  pickerPopup.classList.add('show');

  const items = pickerPopup.querySelectorAll('.stagger-item');
  items.forEach((item, index) => {
    item.style.animation = 'none';
    void item.offsetHeight;
    item.style.animation = `fadeUp 0.35s cubic-bezier(0.34,1.56,0.64,1) ${index * 0.05}s forwards`;
  });

  _pickerJustOpened = true;
  setTimeout(() => { _pickerJustOpened = false; }, 100);
}

function hidePicker() {
  pickerPopup.classList.remove('show');
  currentInput = null;
  rangeStart   = null;
  rangeEnd     = null;
}

// ---- Event wiring ----
// Open on click/focus for datepicker inputs
document.body.addEventListener('mousedown', e => {
  const target = e.target;
  let pickerInput = target.matches('input[data-is-datepicker="true"]') ? target : null;
  if (!pickerInput) {
    const label = target.closest('label');
    if (label) pickerInput = label.querySelector('input[data-is-datepicker="true"]');
  }
  const isInsidePicker = pickerPopup.contains(target);

  if (pickerInput) {
    // Prevent native picker, keep focus
    if (pickerInput !== currentInput) {
      showPicker(pickerInput);
    } else if (!pickerPopup.classList.contains('show')) {
      showPicker(pickerInput);
    }
    e.preventDefault(); // prevent blur then re-focus loop
    return;
  }

  if (!isInsidePicker && !_pickerJustOpened) {
    hidePicker();
  }
}, true);

// Convert native date inputs to custom picker on first focus
document.body.addEventListener('focusin', e => {
  const t = e.target;
  if (t.matches('input[type="date"]') && !t.dataset.isDatepicker) {
    t.type = 'text';
    t.readOnly = true;
    t.dataset.isDatepicker = 'true';
    showPicker(t);
  }
});

// Re-position on scroll/resize
window.addEventListener('scroll', () => {
  if (currentInput && pickerPopup.classList.contains('show')) {
    positionPicker(currentInput);
  }
}, { passive: true });

console.log('Custom fluid date picker loaded (v2)');
