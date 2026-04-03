// ============================================
// FreizeitKarriere – Admin JS Shared Utils
// ============================================
const API = 'http://localhost:3001/api';

// ── Auth ─────────────────────────────────
async function checkAuth(redirect = true) {
  try {
    const r = await fetch(`${API}/auth/check`, { credentials: 'include' });
    const d = await r.json();
    if (!d.authenticated && redirect) {
      window.location.href = '/admin/index.html';
      return false;
    }
    if (d.authenticated) {
      document.querySelectorAll('.sidebar-user-name').forEach(el => el.textContent = d.username);
    }
    return d.authenticated;
  } catch {
    if (redirect) window.location.href = '/admin/index.html';
    return false;
  }
}

async function logout() {
  await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
  window.location.href = '/admin/index.html';
}

// ── Toast Notifications ───────────────────
function toast(msg, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const t = document.createElement('div');
  t.className = `toast ${type === 'error' ? 'error' : ''}`;
  t.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span><span>${msg}</span>`;
  container.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = '0.3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

// ── Confirm Dialog ────────────────────────
function confirm(message, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="dialog">
      <h3>Bestätigung erforderlich</h3>
      <p>${message}</p>
      <div class="dialog-actions">
        <button class="btn btn-ghost btn-sm" id="dlg-cancel">Abbrechen</button>
        <button class="btn btn-danger btn-sm" id="dlg-confirm">Löschen</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#dlg-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#dlg-confirm').onclick = () => { overlay.remove(); onConfirm(); };
  overlay.onclick = e => { if (e.target === overlay) overlay.remove(); };
}

// ── API helpers ───────────────────────────
async function apiGet(path) {
  const r = await fetch(`${API}${path}`, { credentials: 'include' });
  if (!r.ok) throw new Error((await r.json()).error || 'Fehler');
  return r.json();
}
async function apiPost(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'POST', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Fehler');
  return r.json();
}
async function apiPut(path, body) {
  const r = await fetch(`${API}${path}`, {
    method: 'PUT', credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error((await r.json()).error || 'Fehler');
  return r.json();
}
async function apiDelete(path) {
  const r = await fetch(`${API}${path}`, { method: 'DELETE', credentials: 'include' });
  if (!r.ok) throw new Error((await r.json()).error || 'Fehler');
  return r.json();
}

// ── File Upload ───────────────────────────
async function uploadImage(file) {
  const fd = new FormData();
  fd.append('image', file);
  const r = await fetch(`${API}/upload`, { method: 'POST', credentials: 'include', body: fd });
  if (!r.ok) throw new Error((await r.json()).error || 'Upload fehlgeschlagen');
  return r.json(); // { url, filename }
}

// ── Upload Zone ───────────────────────────
function initUploadZone(zoneId, previewId, inputName) {
  const zone    = document.getElementById(zoneId);
  const preview = document.getElementById(previewId);
  const input   = zone?.querySelector('input[type=file]');
  if (!zone) return;

  let currentUrl = zone.dataset.current || '';

  function showPreview(url) {
    currentUrl = url;
    preview.innerHTML = url
      ? `<div class="upload-preview"><img src="${url}" alt="Vorschau"><button class="upload-preview-del" type="button" title="Bild entfernen">✕</button></div>`
      : '';
    preview.querySelector('.upload-preview-del')?.addEventListener('click', () => {
      currentUrl = '';
      preview.innerHTML = '';
      if (input) input.value = '';
    });
  }

  if (zone.dataset.current) showPreview(zone.dataset.current);

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', async e => {
    e.preventDefault(); zone.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) await handleFile(file);
  });

  input?.addEventListener('change', async () => {
    if (input.files[0]) await handleFile(input.files[0]);
  });

  async function handleFile(file) {
    try {
      const { url } = await uploadImage(file);
      showPreview(url);
      toast('Bild hochgeladen');
    } catch(e) { toast(e.message, 'error'); }
  }

  return { getUrl: () => currentUrl };
}

// ── Skill Sliders ─────────────────────────
function initSkillSliders(containerId, initial = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  function updateSlider(slider) {
    const pct = slider.value + '%';
    slider.style.setProperty('--pct', pct);
    slider.closest('.skill-row').querySelector('.skill-value').textContent = slider.value + '%';
  }

  function addSkill(name = '', value = 75) {
    const row = document.createElement('div');
    row.className = 'skill-row';
    row.innerHTML = `
      <input type="text" class="skill-name-input" placeholder="Skill-Name" value="${name}">
      <div class="skill-slider-wrap">
        <input type="range" class="skill-slider" min="0" max="100" value="${value}" style="--pct:${value}%">
      </div>
      <span class="skill-value">${value}%</span>
      <button type="button" class="btn btn-icon btn-danger skill-del" title="Entfernen">✕</button>
    `;
    container.appendChild(row);
    const slider = row.querySelector('.skill-slider');
    slider.addEventListener('input', () => updateSlider(slider));
    row.querySelector('.skill-del').addEventListener('click', () => row.remove());
  }

  initial.forEach(s => addSkill(s.name, s.value));

  document.getElementById(containerId + '-add')?.addEventListener('click', () => addSkill());

  return {
    getSkills() {
      return [...container.querySelectorAll('.skill-row')].map(row => ({
        name:  row.querySelector('.skill-name-input').value.trim(),
        value: parseInt(row.querySelector('.skill-slider').value)
      })).filter(s => s.name);
    }
  };
}

// ── Tag Multi-Select ──────────────────────
function initTagSelect(containerId, allTags, selectedIds = []) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = '';
  let selected = new Set(selectedIds);

  allTags.forEach(tag => {
    const el = document.createElement('span');
    el.className = 'tag-select-item' + (selected.has(tag.id) ? ' selected' : '');
    el.dataset.id = tag.id;
    el.innerHTML = `<span class="check">✓</span> ${tag.name}`;
    el.addEventListener('click', () => {
      el.classList.toggle('selected');
      selected.has(tag.id) ? selected.delete(tag.id) : selected.add(tag.id);
    });
    container.appendChild(el);
  });

  return { getSelected: () => [...selected] };
}

// ── Dynamic List ──────────────────────────
function initDynList(containerId, addBtnId, fields, initial = []) {
  const container = document.getElementById(containerId);
  const addBtn    = document.getElementById(addBtnId);
  if (!container) return;

  function addRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dyn-item';
    const inputs = fields.map(f => {
      if (f.type === 'textarea') {
        return `<textarea class="form-control dyn-field" data-key="${f.key}" placeholder="${f.label}" style="min-height:60px">${data[f.key] || ''}</textarea>`;
      }
      return `<input type="${f.type||'text'}" class="form-control dyn-field" data-key="${f.key}" placeholder="${f.label}" value="${data[f.key] || ''}">`;
    }).join('');

    row.innerHTML = `
      <span class="dyn-handle">⠿</span>
      <div class="dyn-item-fields">
        <div class="dyn-item-row">${inputs}</div>
      </div>
      <button type="button" class="btn btn-icon btn-danger" title="Entfernen">✕</button>
    `;
    row.querySelector('.btn-danger').addEventListener('click', () => row.remove());
    container.appendChild(row);
  }

  initial.forEach(item => addRow(item));
  addBtn?.addEventListener('click', () => addRow());

  return {
    getItems() {
      return [...container.querySelectorAll('.dyn-item')].map(row => {
        const obj = {};
        row.querySelectorAll('.dyn-field').forEach(el => { obj[el.dataset.key] = el.value.trim(); });
        return obj;
      }).filter(obj => Object.values(obj).some(v => v));
    }
  };
}

// ── Tabs ──────────────────────────────────
function initTabs(groupSelector = '.tab-list') {
  document.querySelectorAll(groupSelector + ' .tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const group = btn.closest('[data-tab-group]') || document.body;
      group.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      group.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      const panel = document.getElementById(btn.dataset.tab);
      if (panel) panel.classList.add('active');
    });
  });
}

// ── Sidebar active link ───────────────────
function initSidebarActive() {
  const page = window.location.pathname.split('/').pop();
  document.querySelectorAll('.sidebar-link').forEach(link => {
    const href = link.getAttribute('href')?.split('/').pop();
    if (href === page) link.classList.add('active');
  });
  document.querySelectorAll('.btn-logout').forEach(btn => {
    btn.addEventListener('click', logout);
  });
}

// ── Utility: URL params ───────────────────
function getParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

// ── Utility: escape HTML ──────────────────
function esc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
