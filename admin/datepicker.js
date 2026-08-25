// Custom Vanilla JS Date Picker
const pickerPopup = document.createElement('div');
pickerPopup.className = 'custom-date-picker';
pickerPopup.innerHTML = `
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

function updateHighlight(selectedBtn) {
  const highlight = pickerPopup.querySelector('.cdp-highlight');
  if (!selectedBtn) { highlight.style.opacity = '0'; return; }
  const grid = pickerPopup.querySelector('.cdp-grid');
  const gridRect = grid.getBoundingClientRect();
  const btnRect = selectedBtn.getBoundingClientRect();
  highlight.style.opacity = '1';
  highlight.style.transform = `translate(${btnRect.left - gridRect.left}px, ${btnRect.top - gridRect.top}px)`;
  highlight.style.width = `${btnRect.width}px`;
  highlight.style.height = `${btnRect.height}px`;
}

function getDatesInRange(startStr, endStr) {
  const dates = [];
  let curr = new Date(startStr + 'T00:00:00');
  let end = new Date(endStr + 'T00:00:00');
  if (curr > end) { let tmp = curr; curr = end; end = tmp; }
  while (curr <= end) {
    dates.push(curr.toISOString().split('T')[0]);
    curr.setDate(curr.getDate() + 1);
  }
  return dates;
}

function updateRangeHint() {
  const hint = pickerPopup.querySelector('.cdp-range-hint');
  if (!hint) return;
  if (isRangeMode) {
    hint.textContent = rangeStart ? `開始: ${rangeStart} → 終了を選択` : '開始日を選択';
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

  for (let i = 1; i <= daysInMonth; i++) {
    const btn  = document.createElement('button');
    btn.type   = 'button';
    btn.className = 'cdp-day';
    btn.textContent = i;

    const dStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
    if (dStr === todayStr) btn.classList.add('today');

    if (isRangeMode) {
      if (rangeStart === dStr) { btn.classList.add('selected'); selectedBtn = btn; }
    } else {
      if (selectedStrs.includes(dStr)) { btn.classList.add('selected'); selectedBtn = btn; }
    }

    btn.addEventListener('mousedown', e => {
      e.preventDefault(); // prevent blur on input
      if (!isRangeMode) {
        if (currentInput) {
          currentInput.value = dStr;
          currentInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
        updateHighlight(btn);
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

  requestAnimationFrame(() => updateHighlight(selectedBtn));
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
  const isPickerInput = target.matches('input[data-is-datepicker="true"]');
  const isInsidePicker = pickerPopup.contains(target);

  if (isPickerInput) {
    // Prevent native picker, keep focus
    if (target !== currentInput) {
      showPicker(target);
    } else if (!pickerPopup.classList.contains('show')) {
      showPicker(target);
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
