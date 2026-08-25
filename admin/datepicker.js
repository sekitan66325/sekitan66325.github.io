// Custom Vanilla JS Date Picker (Jeet Nirnejak / Yui540 style)
const pickerPopup = document.createElement('div');
pickerPopup.className = 'custom-date-picker';
pickerPopup.innerHTML = `
  <div class="cdp-header stagger-item">
    <button type="button" class="cdp-prev">&lt;</button>
    <div class="cdp-month"></div>
    <button type="button" class="cdp-next">&gt;</button>
  </div>
  <div class="cdp-days-header stagger-item">
    <span>S</span><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span>
  </div>
  <div class="cdp-grid-wrapper stagger-item">
    <div class="cdp-highlight"></div>
    <div class="cdp-grid"></div>
  </div>
  <div class="cdp-footer stagger-item">
    <button type="button" class="cdp-today">Today</button>
  </div>
`;
document.body.appendChild(pickerPopup);

let currentInput = null;
let viewDate = new Date();

function updateHighlight(selectedBtn) {
  const highlight = pickerPopup.querySelector('.cdp-highlight');
  if (!selectedBtn) {
    highlight.style.opacity = '0';
    return;
  }
  const grid = pickerPopup.querySelector('.cdp-grid');
  const gridRect = grid.getBoundingClientRect();
  const btnRect = selectedBtn.getBoundingClientRect();
  
  const top = btnRect.top - gridRect.top;
  const left = btnRect.left - gridRect.left;
  
  highlight.style.opacity = '1';
  highlight.style.transform = `translate(${left}px, ${top}px)`;
  highlight.style.width = `${btnRect.width}px`;
  highlight.style.height = `${btnRect.height}px`;
}

function renderPicker() {
  const monthEl = pickerPopup.querySelector('.cdp-month');
  const gridEl = pickerPopup.querySelector('.cdp-grid');
  
  monthEl.textContent = `${viewDate.getFullYear()}年 ${viewDate.getMonth() + 1}月`;
  
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
  gridEl.innerHTML = '';
  
  for (let i = 0; i < firstDay; i++) {
    const empty = document.createElement('button');
    empty.className = 'cdp-day empty';
    empty.disabled = true;
    gridEl.appendChild(empty);
  }
  
  const todayStr = new Date().toISOString().split('T')[0];
  const selectedStr = currentInput ? currentInput.value : '';
  let selectedBtn = null;
  
  for (let i = 1; i <= daysInMonth; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cdp-day';
    btn.textContent = i;
    
    const dStr = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
    if (dStr === todayStr) btn.classList.add('today');
    if (dStr === selectedStr) {
      btn.classList.add('selected');
      selectedBtn = btn;
    }
    
    btn.onclick = () => {
      if(currentInput) {
        currentInput.value = dStr;
        currentInput.dispatchEvent(new Event('change'));
      }
      updateHighlight(btn);
      setTimeout(() => hidePicker(), 200);
    };
    gridEl.appendChild(btn);
  }
  
  // Update fluid highlight after grid layout is done
  requestAnimationFrame(() => {
    updateHighlight(selectedBtn);
  });
}

pickerPopup.querySelector('.cdp-prev').onclick = () => { viewDate.setMonth(viewDate.getMonth() - 1); renderPicker(); };
pickerPopup.querySelector('.cdp-next').onclick = () => { viewDate.setMonth(viewDate.getMonth() + 1); renderPicker(); };
pickerPopup.querySelector('.cdp-today').onclick = () => { 
  viewDate = new Date(); 
  if(currentInput) {
    currentInput.value = viewDate.toISOString().split('T')[0];
    currentInput.dispatchEvent(new Event('change'));
  }
  renderPicker();
  setTimeout(() => hidePicker(), 200);
};

function showPicker(inputEl) {
  currentInput = inputEl;
  if(inputEl.value) {
    viewDate = new Date(inputEl.value);
  } else {
    viewDate = new Date();
  }
  renderPicker();
  
  const rect = inputEl.getBoundingClientRect();
  pickerPopup.style.top = `${rect.bottom + window.scrollY + 12}px`;
  pickerPopup.style.left = `${rect.left + window.scrollX}px`;
  pickerPopup.classList.add('show');
  
  // Staggered entrance
  const items = pickerPopup.querySelectorAll('.stagger-item');
  items.forEach((item, index) => {
    item.style.animation = 'none';
    item.offsetHeight; // trigger reflow
    item.style.animation = `fadeUp 0.4s var(--spring-bouncy) ${index * 0.05}s forwards`;
  });
}

function hidePicker() {
  pickerPopup.classList.remove('show');
  currentInput = null;
}

document.addEventListener('click', e => {
  if (e.target.matches('input[type="date"]')) {
    e.target.preventDefault();
  } else if (!pickerPopup.contains(e.target) && !e.target.matches('.form-input.pc-date, .form-input.op-date')) {
    hidePicker();
  }
});

document.body.addEventListener('focusin', e => {
  if (e.target.matches('input[type="date"]')) {
    e.target.type = 'text';
    e.target.readOnly = true;
    showPicker(e.target);
  }
});
document.body.addEventListener('click', e => {
  if (e.target.matches('input[type="text"].pc-date, input[type="text"].op-date')) {
    showPicker(e.target);
  }
});

console.log("Custom fluid date picker loaded");
