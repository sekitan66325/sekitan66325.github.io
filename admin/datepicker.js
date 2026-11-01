// Custom Vanilla JS Date Picker (Flat Minimal)
const pickerPopup = document.createElement('div');
pickerPopup.className = 'custom-date-picker';
pickerPopup.innerHTML = `
  <div class="cdp-header">
    <button type="button" class="cdp-prev" aria-label="前の月">&lt;</button>
    <div class="cdp-month"></div>
    <button type="button" class="cdp-next" aria-label="次の月">&gt;</button>
  </div>
  <div class="cdp-days-header">
    <span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span>
  </div>
  <div class="cdp-grid-wrapper">
    <div class="cdp-grid"></div>
  </div>
  <div class="cdp-footer">
    <span class="cdp-range-hint"></span>
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

function getDatesInRange(startStr, endStr) {
  const dates = [];
  let curr = new Date(startStr + 'T00:00:00');
  let end = new Date(endStr + 'T00:00:00');
  if (curr > end) { const tmp = curr; curr = end; end = tmp; }
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
    hint.textContent = rangeStart ? `開始: ${rangeStart} → 終了日を選択` : '開始日と終了日を選択';
  } else {
    hint.textContent = '';
  }
}

function renderPicker() {
  const monthEl = pickerPopup.querySelector('.cdp-month');
  const gridEl = pickerPopup.querySelector('.cdp-grid');

  if (isNaN(viewDate.getTime())) viewDate = new Date();

  monthEl.textContent = `${viewDate.getFullYear()}年 ${viewDate.getMonth() + 1}月`;

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  gridEl.innerHTML = '';

  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('button');
    empty.type = 'button';
    empty.className = 'cdp-day empty';
    empty.disabled = true;
    gridEl.appendChild(empty);
  }

  const todayStr = new Date().toISOString().split('T')[0];
  let selectedStrs = [];
  if (currentInput && currentInput.value) {
    const val = currentInput.value.trim();
    if (val.includes('~')) {
      const [s, e] = val.split('~');
      selectedStrs = getDatesInRange(s.trim(), e.trim());
    } else if (val.includes('..')) {
      const [s, e] = val.split('..');
      selectedStrs = getDatesInRange(s.trim(), e.trim());
    } else {
      selectedStrs = val.split(',').map(s => s.trim()).filter(s => /^\d{4}-\d{2}-\d{2}$/.test(s));
    }
  }

  const isHoverRange = isRangeMode && rangeStart && !rangeEnd;
  const rangeStartDate = rangeStart ? new Date(rangeStart + 'T00:00:00') : null;

  for (let i = 1; i <= daysInMonth; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cdp-day';
    btn.textContent = i;

    const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
    const btnDate = new Date(dStr + 'T00:00:00');
    btn.dataset.date = dStr;

    if (dStr === todayStr) btn.classList.add('today');

    if (isRangeMode) {
      if (rangeStart) {
        if (rangeStart === dStr) btn.classList.add('selected', 'range-start');
      } else if (selectedStrs.length > 0) {
        const first = selectedStrs[0];
        const last = selectedStrs[selectedStrs.length - 1];
        if (dStr === first) btn.classList.add('selected', 'range-start');
        if (dStr === last) btn.classList.add('selected', 'range-end');
        if (selectedStrs.includes(dStr) && dStr !== first && dStr !== last) {
          btn.classList.add('range-between');
        }
      }
    } else if (selectedStrs.includes(dStr)) {
      btn.classList.add('selected');
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
      e.preventDefault();
      if (!isRangeMode) {
        if (currentInput) {
          currentInput.value = dStr;
          currentInput.dispatchEvent(new Event('change', { bubbles: true }));
          currentInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        hidePicker();
      } else if (!rangeStart) {
        rangeStart = dStr;
        updateRangeHint();
        renderPicker();
      } else {
        rangeEnd = dStr;
        let rStart = rangeStart;
        let rEnd = rangeEnd;
        if (rStart > rEnd) { const tmp = rStart; rStart = rEnd; rEnd = tmp; }
        const formatted = (rStart === rEnd) ? rStart : `${rStart}~${rEnd}`;
        if (currentInput) {
          currentInput.value = formatted;
          currentInput.dispatchEvent(new Event('change', { bubbles: true }));
          currentInput.dispatchEvent(new Event('input', { bubbles: true }));
        }
        rangeStart = null;
        rangeEnd = null;
        updateRangeHint();
        hidePicker();
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
    currentInput.dispatchEvent(new Event('input', { bubbles: true }));
    hidePicker();
    return;
  }
  renderPicker();
});

function positionPicker(inputEl) {
  const rect = inputEl.getBoundingClientRect();
  const pw = pickerPopup.offsetWidth || 268;
  const ph = pickerPopup.offsetHeight || 290;

  let top = rect.bottom + window.scrollY + 4;
  if (rect.bottom + ph + 12 > window.innerHeight && rect.top > ph + 12) {
    top = rect.top + window.scrollY - ph - 4;
  }

  let left = rect.left + window.scrollX;
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (left < 8) left = 8;

  pickerPopup.style.top = `${top}px`;
  pickerPopup.style.left = `${left}px`;
}

function showPicker(inputEl) {
  currentInput = inputEl;
  isRangeMode = inputEl.dataset.range === 'true';
  rangeStart = null;
  rangeEnd = null;

  let firstVal = (inputEl.value || '').trim();
  if (firstVal.includes('~')) firstVal = firstVal.split('~')[0].trim();
  else if (firstVal.includes('..')) firstVal = firstVal.split('..')[0].trim();
  else firstVal = firstVal.split(',')[0].trim();
  viewDate = (firstVal && /^\d{4}-\d{2}-\d{2}$/.test(firstVal))
    ? new Date(firstVal + 'T00:00:00')
    : new Date();

  renderPicker();
  pickerPopup.classList.add('show');
  positionPicker(inputEl);

  _pickerJustOpened = true;
  setTimeout(() => { _pickerJustOpened = false; }, 100);
}

function hidePicker() {
  pickerPopup.classList.remove('show');
  currentInput = null;
  rangeStart = null;
  rangeEnd = null;
}

document.body.addEventListener('mousedown', e => {
  const target = e.target;
  let pickerInput = target.matches('input[data-is-datepicker="true"]') ? target : null;
  if (!pickerInput) {
    const label = target.closest('label');
    if (label) pickerInput = label.querySelector('input[data-is-datepicker="true"]');
  }
  const isInsidePicker = pickerPopup.contains(target);

  if (pickerInput) {
    if (pickerInput !== currentInput || !pickerPopup.classList.contains('show')) {
      showPicker(pickerInput);
    }
    e.preventDefault();
    return;
  }

  if (!isInsidePicker && !_pickerJustOpened) {
    hidePicker();
  }
}, true);

document.body.addEventListener('focusin', e => {
  const t = e.target;
  if (t.matches('input[type="date"]') && !t.dataset.isDatepicker) {
    t.type = 'text';
    t.readOnly = true;
    t.dataset.isDatepicker = 'true';
    showPicker(t);
  }
});

window.addEventListener('scroll', () => {
  if (currentInput && pickerPopup.classList.contains('show')) {
    positionPicker(currentInput);
  }
}, { capture: true, passive: true });
