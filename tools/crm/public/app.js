// app.js — Crown Media CRM frontend logic
'use strict';

// ── State ─────────────────────────────────────────────────────────────────────

let allContacts = [];
let filteredContacts = [];
let selectedIds = new Set();
let currentContactId = null;
let currentDrafts = null;
let sortCol = 'name';
let sortDir = 1; // 1 = asc, -1 = desc
let activeStatusFilter = '';
let activePriorityFilter = '';
let settings = {};
let showArchived = false;
let importedContacts = [];

// ── Init ──────────────────────────────────────────────────────────────────────

let searchDebounceTimer = null;

document.addEventListener('DOMContentLoaded', () => {
  loadTheme();
  loadBranding();
  loadContacts();
  loadStats();
  loadSettings();
  loadTodayTasks();
  bindEvents();
  autoPrioritize();
});

// ── Delegated close handler — catches ALL [data-close] buttons regardless of JS binding ──
document.addEventListener('click', e => {
  const btn = e.target.closest('[data-close]');
  if (!btn) return;
  const target = btn.dataset.close;
  if (target === 'contact') { closeContactModal(); }
  else { closeModal(target); }
}, true); // capture phase — fires before any other handler

// ── API helpers ───────────────────────────────────────────────────────────────

async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (res.status === 401) {
    window.location.href = '/login';
    return;
  }
  if (res.status === 402) {
    const err = await res.json().catch(() => ({ message: 'Subscription required' }));
    showSubscriptionExpired(err.message);
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

function showSubscriptionExpired(msg) {
  let overlay = document.getElementById('subExpiredOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'subExpiredOverlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:9999';
    overlay.innerHTML = `<div style="background:#1E2D45;border:1px solid rgba(201,168,76,0.3);border-radius:12px;padding:40px 32px;max-width:440px;text-align:center">
      <div style="font-size:2rem;margin-bottom:16px">⏰</div>
      <h2 style="color:#C9A84C;font-size:1.2rem;margin-bottom:12px">Subscription Required</h2>
      <p id="subExpiredMsg" style="color:rgba(255,255,255,0.7);font-size:.9rem;line-height:1.6;margin-bottom:24px">${msg}</p>
      <a href="mailto:king@crownmediagroup.co" style="display:inline-block;background:#C9A84C;color:#0A1628;padding:11px 28px;border-radius:8px;font-weight:700;text-decoration:none;font-size:.85rem">Contact Crown Media Group</a>
    </div>`;
    document.body.appendChild(overlay);
  } else {
    document.getElementById('subExpiredMsg').textContent = msg;
    overlay.style.display = 'flex';
  }
}

const get  = (path) => api(path);
const post = (path, body) => api(path, { method: 'POST', body: JSON.stringify(body) });
const put  = (path, body) => api(path, { method: 'PUT',  body: JSON.stringify(body) });

// ── Toast ─────────────────────────────────────────────────────────────────────

function toast(msg, type = 'success') {
  const c = document.getElementById('toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  c.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 350);
  }, 3500);
}

// ── Branding ──────────────────────────────────────────────────────────────────

async function loadBranding() {
  try {
    const b = await get('/api/branding');
    if (b.name) {
      const el = document.getElementById('workspaceName');
      if (el) el.textContent = b.name;
    }
    if (b.primaryColor) {
      document.documentElement.style.setProperty('--gold', b.primaryColor);
    }
  } catch (_) {}

  // Show Admin link for superadmin + load trial banner
  try {
    const me = await get('/api/me');
    if (me?.user?.role === 'superadmin') {
      document.getElementById('btnAdmin')?.classList.remove('hidden');
      document.querySelector('[data-tab="hub"]')?.classList.remove('hidden');
    }
    if (me?.trialDaysLeft !== null && me?.trialDaysLeft !== undefined) {
      showTrialBanner(me.trialDaysLeft, me.workspace?.subscription_status);
    }
  } catch (_) {}
}

function showTrialBanner(daysLeft, status) {
  const banner = document.getElementById('trialBanner');
  if (!banner) return;
  if (status === 'active') { banner.style.display = 'none'; return; }
  if (status === 'expired' || status === 'cancelled') {
    banner.style.cssText = 'display:flex';
    banner.className = 'trial-banner trial-expired';
    banner.innerHTML = `<span>Your subscription has ended. <a href="mailto:king@crownmediagroup.co" style="color:inherit;font-weight:700">Contact Crown Media Group to reactivate.</a></span>`;
    return;
  }
  if (status === 'trial') {
    if (daysLeft <= 0) {
      banner.style.cssText = 'display:flex';
      banner.className = 'trial-banner trial-expired';
      banner.innerHTML = `<span>Your 33-day free trial has ended. <a href="mailto:king@crownmediagroup.co" style="color:inherit;font-weight:700">Subscribe for $97/month →</a></span>`;
    } else if (daysLeft <= 7) {
      banner.style.cssText = 'display:flex';
      banner.className = 'trial-banner trial-warning';
      banner.innerHTML = `<span>${daysLeft} day${daysLeft !== 1 ? 's' : ''} left in your free trial. <a href="mailto:king@crownmediagroup.co" style="color:inherit;font-weight:700">Subscribe now — $97/month →</a></span>`;
    } else {
      banner.style.cssText = 'display:flex';
      banner.className = 'trial-banner trial-info';
      banner.innerHTML = `<span>Free trial active — ${daysLeft} days remaining</span><button type="button" onclick="this.parentElement.style.display='none'" style="background:none;border:none;color:inherit;cursor:pointer;margin-left:auto;font-size:1.2rem;line-height:1;padding:0 4px">&times;</button>`;
    }
  }
}

// ── Theme ─────────────────────────────────────────────────────────────────────

function loadTheme() {
  const saved = localStorage.getItem('crm-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);
  document.getElementById('themeToggle').textContent = saved === 'dark' ? '☀️ Light' : '🌙 Dark';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme');
  const next = cur === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('crm-theme', next);
  document.getElementById('themeToggle').textContent = next === 'dark' ? '☀️ Light' : '🌙 Dark';
}

// ── Tab navigation ────────────────────────────────────────────────────────────

function switchTab(tab) {
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.mbn-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.main').forEach(m => m.classList.toggle('hidden', m.id !== `tab-${tab}`));
  if (tab === 'settings')  loadSettings();
  if (tab === 'pipeline')  loadPipeline();
  if (tab === 'reports')   loadReports();
  if (tab === 'leads')     loadLeadGen();
  if (tab === 'inbox')     loadInbox();
}

// ── Load contacts ─────────────────────────────────────────────────────────────

async function loadContacts() {
  try {
    allContacts = await get(`/api/contacts${showArchived ? '?showArchived=true' : ''}`);
    applyFilters();
  } catch (e) {
    document.getElementById('contactsBody').innerHTML =
      `<tr><td colspan="9" class="empty">Failed to load contacts: ${e.message}</td></tr>`;
  }
}

// ── Load stats ────────────────────────────────────────────────────────────────

async function loadStats() {
  try {
    const s = await get('/api/stats');
    document.getElementById('stat-total').textContent        = s.total        ?? 0;
    document.getElementById('stat-notcontacted').textContent = s.notContacted ?? 0;
    document.getElementById('stat-pipeline').textContent     = s.inPipeline   ?? 0;
    document.getElementById('stat-clients').textContent      = s.clients      ?? 0;
    document.getElementById('stat-hot').textContent          = s.hot          ?? 0;
    document.getElementById('stat-today').textContent        = s.reachedToday ?? 0;

    const goal = s.dailyGoal || 10;
    const today = s.reachedToday || 0;
    const pct = Math.min(100, Math.round((today / goal) * 100));
    document.getElementById('goalText').textContent = `${today} / ${goal}`;
    document.getElementById('goalFill').style.width = `${pct}%`;
    document.getElementById('goalPct').textContent  = `${pct}%`;
  } catch (_) {}
}

// ── Filter & render table ─────────────────────────────────────────────────────

function applyFilters() {
  const search   = document.getElementById('searchInput').value.toLowerCase();
  const status   = activeStatusFilter;
  const priority = activePriorityFilter;

  const now7 = new Date(); now7.setDate(now7.getDate() - 7);

  filteredContacts = allContacts.filter(c => {
    if (c.id === 3) return false; // King — skip for outreach
    if (!showArchived && c.archived) return false;
    if (status === 'pipeline') {
      const pipeline = ['Called','Emailed','Texted','Pitched','Proposal Sent'];
      if (!pipeline.includes(c.status)) return false;
    } else if (status && c.status !== status) return false;

    if (priority && c.priority !== priority) return false;

    // Quick filters
    if (activeQuickFilter === 'hot'      && c.priority !== 'Hot') return false;
    if (activeQuickFilter === 'clients'  && c.status   !== 'Client') return false;
    if (activeQuickFilter === 'followup' && c.next_followup !== new Date().toISOString().split('T')[0]) return false;
    if (activeQuickFilter === 'notouch'  && c.last_contacted && new Date(c.last_contacted) >= now7) return false;

    if (search) {
      const haystack = `${c.name} ${c.business} ${c.phone} ${c.email}`.toLowerCase();
      if (!haystack.includes(search)) return false;
    }
    return true;
  });

  sortContacts();
  renderTable();
}

function sortContacts() {
  filteredContacts.sort((a, b) => {
    const av = (a[sortCol] || '').toString().toLowerCase();
    const bv = (b[sortCol] || '').toString().toLowerCase();
    return av < bv ? -sortDir : av > bv ? sortDir : 0;
  });
}

function renderTable() {
  const tbody = document.getElementById('contactsBody');
  if (!filteredContacts.length) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty">No contacts match your filters</td></tr>`;
    return;
  }

  tbody.innerHTML = filteredContacts.map(c => {
    const checked   = selectedIds.has(c.id) ? 'checked' : '';
    const statusCls = statusClass(c.status);
    const priCls    = priorityClass(c.priority);
    const lastDate  = c.last_contacted ? fmtDate(c.last_contacted) : '—';
    const isHot     = c.priority === 'Hot';

    return `<tr data-id="${c.id}" class="${selectedIds.has(c.id) ? 'selected' : ''}">
      <td class="cb-col"><input type="checkbox" class="row-cb" data-id="${c.id}" ${checked}></td>
      <td class="clickable-cell" data-label="Name">${esc(c.name)}</td>
      <td class="clickable-cell" data-label="Business">${esc(c.business || '—')}</td>
      <td data-label="Phone"><a class="phone-link" href="tel:${esc(c.phone)}" data-id="${c.id}" data-phone="${esc(c.phone)}">${esc(c.phone || '—')}</a></td>
      <td data-label="Email"><a class="email-link" href="mailto:${esc(c.email)}" data-id="${c.id}">${esc(c.email || '—')}</a></td>
      <td data-label="Status"><span class="pill ${statusCls}">${esc(c.status)}</span></td>
      <td data-label="Priority"><span class="pill ${priCls}">${esc(c.priority)}</span></td>
      <td data-label="Last Contact">${lastDate}</td>
      <td data-label="Hot"><button class="star-btn ${isHot ? 'star-hot' : ''}" data-id="${c.id}" title="${isHot ? 'Remove Hot' : 'Mark Hot'}">★</button></td>
    </tr>`;
  }).join('');

  // Attach row click (open modal) and checkbox events
  tbody.querySelectorAll('tr').forEach(row => {
    const id = parseInt(row.dataset.id);

    // Row click → modal (not on checkbox, link, or star button)
    row.addEventListener('click', e => {
      if (e.target.type === 'checkbox' || e.target.closest('a') || e.target.classList.contains('star-btn')) return;
      openModal(id);
    });
  });

  tbody.querySelectorAll('.star-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id = parseInt(btn.dataset.id);
      const idx = allContacts.findIndex(c => c.id === id);
      if (idx === -1) return;
      const newPriority = allContacts[idx].priority === 'Hot' ? 'Normal' : 'Hot';
      try {
        await put(`/api/contacts/${id}`, { priority: newPriority });
        allContacts[idx].priority = newPriority;
        applyFilters();
        loadStats();
      } catch (e) { toast('Update failed', 'error'); }
    });
  });

  tbody.querySelectorAll('.row-cb').forEach(cb => {
    cb.addEventListener('change', () => toggleSelect(parseInt(cb.dataset.id), cb.checked));
  });

  tbody.querySelectorAll('.phone-link').forEach(a => {
    a.addEventListener('click', e => {
      const id = parseInt(a.dataset.id);
      if (id) logPhoneCall(id, a.dataset.phone);
    });
  });
}

function statusClass(s) {
  const map = {
    'Not Contacted':  'pill-not-contacted',
    'Called':         'pill-called',
    'Emailed':        'pill-emailed',
    'Texted':         'pill-texted',
    'Pitched':        'pill-pitched',
    'Proposal Sent':  'pill-proposal',
    'Client':         'pill-client',
    'Not Interested': 'pill-not-interested',
  };
  return map[s] || 'pill-not-contacted';
}

function priorityClass(p) {
  const map = { Hot: 'pill-hot', Warm: 'pill-warm', Normal: 'pill-normal', Cold: 'pill-cold' };
  return map[p] || 'pill-normal';
}

// ── Phone call auto-log ───────────────────────────────────────────────────────

async function logPhoneCall(id, phone) {
  try {
    await post(`/api/contacts/${id}/interaction`, {
      type: 'Call', outcome: 'Neutral', notes: `Called ${phone}`
    });
    // Refresh stats + contact row silently
    loadStats();
    const idx = allContacts.findIndex(c => c.id === id);
    if (idx !== -1) {
      allContacts[idx].last_contacted = new Date().toISOString().split('T')[0];
      if (allContacts[idx].status === 'Not Contacted') allContacts[idx].status = 'Called';
      applyFilters();
    }
  } catch (_) {}
}

// ── Selection ─────────────────────────────────────────────────────────────────

function toggleSelect(id, checked) {
  if (checked) selectedIds.add(id); else selectedIds.delete(id);
  updateMassBar();
  updateSelectAllCheckbox();
}

function updateMassBar() {
  const n   = selectedIds.size;
  const bar = document.getElementById('massBar');
  bar.classList.toggle('visible', n > 0);
  const fab = document.getElementById('mobileFabBar');
  if (fab) {
    fab.classList.toggle('visible', n > 0);
    const fabCount = document.getElementById('mobileFabCount');
    if (fabCount) fabCount.textContent = `${n} selected`;
  }
  document.getElementById('massBarText').textContent = `${n} selected`;
  document.getElementById('massEmailSendCount').textContent = n;
  document.getElementById('massSMSSendCount').textContent   = n;
  document.getElementById('massEmailCount').textContent     = `${n} contacts selected`;
  document.getElementById('massSMSCount').textContent       = `${n} contacts selected`;
}

function updateSelectAllCheckbox() {
  const all = document.getElementById('selectAll');
  const rows = filteredContacts.length;
  const sel  = filteredContacts.filter(c => selectedIds.has(c.id)).length;
  all.checked       = rows > 0 && sel === rows;
  all.indeterminate = sel > 0 && sel < rows;
}

// ── Sort ──────────────────────────────────────────────────────────────────────

function handleSort(col) {
  if (sortCol === col) sortDir *= -1; else { sortCol = col; sortDir = 1; }
  sortContacts();
  renderTable();
}

// ── Modal ─────────────────────────────────────────────────────────────────────

async function openModal(id) {
  currentContactId = id;
  currentDrafts    = null;
  document.body.style.overflow = 'hidden';

  // Reset draft panel
  document.getElementById('aiTabs').style.display    = 'none';
  document.getElementById('draftEmail').style.display = 'none';
  document.getElementById('draftCall').style.display  = 'none';
  document.getElementById('draftDM').style.display    = 'none';
  document.getElementById('draftLoading').style.display = 'none';

  try {
    const data = await get(`/api/contacts/${id}`);
    const c = data.contact;

    document.getElementById('modalName').textContent     = c.name;
    document.getElementById('modalBusiness').textContent = c.business || '';
    document.getElementById('modalSource').textContent   = c.source   || '—';

    // Editable fields
    document.getElementById('modalEditName').value     = c.name     || '';
    document.getElementById('modalEditBusiness').value = c.business || '';
    document.getElementById('modalEditPhone').value    = c.phone    || '';
    document.getElementById('modalEditEmail').value    = c.email    || '';

    // Keep quick-action links updated
    const phoneEl = document.getElementById('modalPhone');
    phoneEl.href = `tel:${c.phone || ''}`;
    const emailEl = document.getElementById('modalEmail');
    emailEl.href = `mailto:${c.email || ''}`;

    document.getElementById('modalStatus').value   = c.status   || 'Not Contacted';
    document.getElementById('modalPriority').value = c.priority || 'Normal';
    document.getElementById('modalFollowup').value = c.next_followup || '';
    document.getElementById('modalDealValue').value = c.deal_value || '';
    document.getElementById('modalNotes').value    = c.notes    || '';

    // Show/hide archive button based on current state
    const archBtn = document.getElementById('archiveContactBtn');
    if (archBtn) archBtn.textContent = c.archived ? 'Unarchive' : 'Archive';

    // Reset task fields
    document.getElementById('taskTitle').value   = '';
    document.getElementById('taskDueDate').value = '';

    renderTimeline(data.interactions || []);
    loadContactTags(id);
    loadContactTasks(id);
  } catch (e) {
    toast(`Failed to load contact: ${e.message}`, 'error');
    return;
  }

  document.getElementById('contactModal').classList.remove('hidden');
}

function attachSwipeToClose(overlayId, closeFn) {
  const overlay = document.getElementById(overlayId);
  if (!overlay) return;
  const modal = overlay.querySelector('.modal');
  if (!modal) return;
  let startY = 0;
  modal.addEventListener('touchstart', e => { startY = e.touches[0].clientY; }, { passive: true });
  modal.addEventListener('touchmove', e => {
    const d = e.touches[0].clientY - startY;
    if (d > 0) { modal.style.transform = `translateY(${d}px)`; modal.style.transition = 'none'; }
  }, { passive: true });
  modal.addEventListener('touchend', e => {
    const d = e.changedTouches[0].clientY - startY;
    if (d > 80) {
      modal.style.transform = ''; modal.style.transition = '';
      closeFn();
    } else {
      modal.style.transition = 'transform .2s ease';
      modal.style.transform = '';
      setTimeout(() => { modal.style.transition = ''; }, 200);
    }
  }, { passive: true });
}

function closeContactModal() {
  document.body.style.overflow = '';
  document.getElementById('contactModal').classList.add('hidden');
  currentContactId = null;
}
window.closeContactModal = closeContactModal;

function closeModal(id) {
  document.body.style.overflow = '';
  document.getElementById(id).classList.add('hidden');
}
window.closeModal = closeModal;

function renderTimeline(interactions) {
  const el = document.getElementById('timeline');
  if (!interactions.length) {
    el.innerHTML = `<div style="color:var(--muted);font-size:13px;text-align:center;padding:16px">No interactions yet</div>`;
    return;
  }
  el.innerHTML = [...interactions].reverse().map(i => `
    <div class="timeline-item timeline-${(i.type||'').toLowerCase()}">
      <div class="timeline-header">
        <span class="timeline-type">${esc(i.type)}</span>
        <span class="timeline-outcome outcome-${(i.outcome||'neutral').toLowerCase()}">${esc(i.outcome)}</span>
        <span class="timeline-date">${fmtDateTime(i.date)}</span>
      </div>
      ${i.notes ? `<div class="timeline-notes">${esc(i.notes)}</div>` : ''}
    </div>`).join('');
}

// ── Save contact ──────────────────────────────────────────────────────────────

async function saveContact() {
  if (!currentContactId) return;
  const name = document.getElementById('modalEditName').value.trim();
  if (!name) { toast('Name is required', 'error'); return; }
  try {
    const dealVal = parseFloat(document.getElementById('modalDealValue').value) || 0;
    await put(`/api/contacts/${currentContactId}`, {
      name,
      business:     document.getElementById('modalEditBusiness').value.trim(),
      phone:        document.getElementById('modalEditPhone').value.trim(),
      email:        document.getElementById('modalEditEmail').value.trim(),
      status:       document.getElementById('modalStatus').value,
      priority:     document.getElementById('modalPriority').value,
      next_followup: document.getElementById('modalFollowup').value,
      notes:        document.getElementById('modalNotes').value,
      deal_value:   dealVal,
    });
    // Update local state
    const idx = allContacts.findIndex(c => c.id === currentContactId);
    if (idx !== -1) {
      allContacts[idx].name         = name;
      allContacts[idx].business     = document.getElementById('modalEditBusiness').value.trim();
      allContacts[idx].phone        = document.getElementById('modalEditPhone').value.trim();
      allContacts[idx].email        = document.getElementById('modalEditEmail').value.trim();
      allContacts[idx].status       = document.getElementById('modalStatus').value;
      allContacts[idx].priority     = document.getElementById('modalPriority').value;
      allContacts[idx].next_followup = document.getElementById('modalFollowup').value;
      allContacts[idx].notes        = document.getElementById('modalNotes').value;
      allContacts[idx].deal_value   = dealVal;
    }
    applyFilters();
    loadStats();
    toast('Contact saved');
    closeContactModal();
  } catch (e) {
    toast(`Save failed: ${e.message}`, 'error');
  }
}

// ── Log interaction ───────────────────────────────────────────────────────────

async function saveLog() {
  if (!currentContactId) return;
  const type    = document.getElementById('logType').value;
  const outcome = document.getElementById('logOutcome').value;
  const notes   = document.getElementById('logNotes').value;

  try {
    await post(`/api/contacts/${currentContactId}/interaction`, { type, outcome, notes });
    document.getElementById('logNotes').value = '';
    toast('Interaction logged');

    // Refresh timeline
    const data = await get(`/api/contacts/${currentContactId}`);
    renderTimeline(data.interactions || []);

    // Update local contact row
    const idx = allContacts.findIndex(c => c.id === currentContactId);
    if (idx !== -1) {
      allContacts[idx].last_contacted = new Date().toISOString().split('T')[0];
      const statusMap = { Call: 'Called', Email: 'Emailed', Text: 'Texted' };
      if (allContacts[idx].status === 'Not Contacted' && statusMap[type]) {
        allContacts[idx].status = statusMap[type];
      }
    }
    applyFilters();
    loadStats();
  } catch (e) {
    toast(`Failed to log: ${e.message}`, 'error');
  }
}

// ── AI Drafts ─────────────────────────────────────────────────────────────────

async function generateDraft() {
  if (!currentContactId) return;
  const contact = allContacts.find(c => c.id === currentContactId);
  if (!contact) return;

  document.getElementById('draftLoading').style.display = 'block';
  document.getElementById('aiTabs').style.display       = 'none';
  document.getElementById('draftEmail').style.display   = 'none';
  document.getElementById('draftCall').style.display    = 'none';
  document.getElementById('draftDM').style.display      = 'none';

  try {
    const result = await post('/api/ai/draft', {
      name:     contact.name,
      business: contact.business,
      notes:    contact.notes,
    });

    currentDrafts = result.draft;
    document.getElementById('draftLoading').style.display = 'none';
    document.getElementById('aiTabs').style.display       = 'flex';

    // Default to email tab
    showDraftTab('email');
  } catch (e) {
    document.getElementById('draftLoading').style.display = 'none';
    toast(`AI draft failed: ${e.message}`, 'error');
  }
}

function showDraftTab(tab) {
  document.querySelectorAll('.ai-tab').forEach(b => b.classList.toggle('active', b.dataset.draft === tab));
  document.getElementById('draftEmail').style.display = tab === 'email' ? 'block' : 'none';
  document.getElementById('draftCall').style.display  = tab === 'call'  ? 'block' : 'none';
  document.getElementById('draftDM').style.display    = tab === 'dm'    ? 'block' : 'none';

  if (!currentDrafts) return;

  if (tab === 'email' && currentDrafts.email) {
    document.getElementById('draftEmailSubject').textContent = currentDrafts.email.subject || '';
    document.getElementById('draftEmailBody').textContent    = currentDrafts.email.body    || '';
  }
  if (tab === 'call' && currentDrafts.callScript) {
    document.getElementById('draftCall').textContent = currentDrafts.callScript;
  }
  if (tab === 'dm' && currentDrafts.dm) {
    document.getElementById('draftDM').textContent = currentDrafts.dm;
  }
}

window.copyDraft = function(type) {
  if (!currentDrafts) return;
  let text = '';
  if (type === 'email') {
    text = `Subject: ${currentDrafts.email?.subject || ''}\n\n${currentDrafts.email?.body || ''}`;
  } else if (type === 'call') {
    text = currentDrafts.callScript || '';
  } else if (type === 'dm') {
    text = currentDrafts.dm || '';
  }
  navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard')).catch(() => toast('Copy failed', 'error'));
};

// ── Single email from modal ───────────────────────────────────────────────────

async function sendSingleEmail() {
  if (!currentContactId) return;
  const c = allContacts.find(x => x.id === currentContactId);
  if (!c || !c.email) { toast('No email on file', 'error'); return; }

  // Pre-fill the mass email modal with just this contact
  selectedIds.clear();
  selectedIds.add(currentContactId);
  updateMassBar();
  openMassEmailModal();
}

async function sendSingleSMS() {
  if (!currentContactId) return;
  const c = allContacts.find(x => x.id === currentContactId);
  if (!c || !c.phone) { toast('No phone on file', 'error'); return; }

  selectedIds.clear();
  selectedIds.add(currentContactId);
  updateMassBar();
  openMassSMSModal();
}

// ── Mass Email ────────────────────────────────────────────────────────────────

function openMassEmailModal() {
  document.body.style.overflow = 'hidden';
  if (!selectedIds.size) { toast('Select at least one contact first', 'error'); return; }
  document.getElementById('massEmailPreview').style.display = 'none';
  document.getElementById('massEmailModal').classList.remove('hidden');
}

function previewMassEmail() {
  const subject = document.getElementById('massEmailSubject').value;
  const body    = document.getElementById('massEmailBody').value;
  const firstId = [...selectedIds][0];
  const c       = allContacts.find(x => x.id === firstId);
  if (!c) return;

  const previewSub  = personalize(subject, c);
  const previewBody = personalize(body, c);

  document.getElementById('previewSubject').textContent = previewSub;
  document.getElementById('previewBody').textContent    = previewBody;
  document.getElementById('massEmailPreview').style.display = 'block';
}

async function sendMassEmail() {
  const subject  = document.getElementById('massEmailSubject').value.trim();
  const body     = document.getElementById('massEmailBody').value.trim();
  if (!subject || !body) { toast('Subject and body are required', 'error'); return; }

  const btn = document.getElementById('sendMassEmail');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const result = await post('/api/email/mass', {
      contactIds: [...selectedIds],
      subject, body,
    });
    toast(`Sent to ${result.sent} contacts${result.failed ? `, ${result.failed} failed` : ''}`);
    closeModal('massEmailModal');
    selectedIds.clear();
    updateMassBar();
    loadContacts();
    loadStats();
  } catch (e) {
    toast(`Send failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Send to <span id="massEmailSendCount">' + selectedIds.size + '</span> Contacts';
  }
}

// ── Mass SMS ──────────────────────────────────────────────────────────────────

function openMassSMSModal() {
  document.body.style.overflow = 'hidden';
  if (!selectedIds.size) { toast('Select at least one contact first', 'error'); return; }
  document.getElementById('massSMSModal').classList.remove('hidden');
}

async function sendMassSMS() {
  const body = document.getElementById('massSMSBody').value.trim();
  if (!body) { toast('Message is required', 'error'); return; }

  const btn = document.getElementById('sendMassSMS');
  btn.disabled = true;
  btn.textContent = 'Sending...';

  try {
    const result = await post('/api/sms/mass', {
      contactIds: [...selectedIds],
      body,
    });
    toast(`Sent to ${result.sent} contacts${result.failed ? `, ${result.failed} failed` : ''}`);
    closeModal('massSMSModal');
    selectedIds.clear();
    updateMassBar();
    loadContacts();
    loadStats();
  } catch (e) {
    toast(`Send failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Send to <span id="massSMSSendCount">' + selectedIds.size + '</span> Contacts';
  }
}

// ── Variable substitution ─────────────────────────────────────────────────────

function personalize(text, contact) {
  return text
    .replace(/\{\{name\}\}/gi,     contact.name     || '')
    .replace(/\{\{business\}\}/gi, contact.business || '')
    .replace(/\{\{myname\}\}/gi,   settings.owner_name || 'King');
}

// ── Settings ──────────────────────────────────────────────────────────────────

async function loadSettings() {
  try {
    const data = await get('/api/settings');
    settings = data;

    ['owner_name', 'agency_name', 'website', 'daily_goal'].forEach(k => {
      const el = document.getElementById(`set-${k}`);
      if (el) el.value = data[k] || '';
    });

    // Service status dots
    setDot('emailDot', 'emailStatus', data.emailConfigured,
      'Gmail connected', 'Not configured — add GMAIL_USER + GMAIL_APP_PASSWORD to .env');
    setDot('smsDot', 'smsStatus', data.twilioConfigured,
      'Twilio connected', 'Not configured — check .env for TWILIO_* vars');
    setDot('aiDot', 'aiStatus', data.aiConfigured,
      'Claude Haiku ready', 'Not configured — add ANTHROPIC_API_KEY to .env');
  } catch (e) {
    toast(`Settings load failed: ${e.message}`, 'error');
  }
}

function setDot(dotId, statusId, ok, okText, failText) {
  const dot = document.getElementById(dotId);
  const txt = document.getElementById(statusId);
  if (!dot || !txt) return;
  dot.className = `status-dot ${ok ? 'ok' : 'err'}`;
  txt.textContent = ok ? okText : failText;
}

async function saveSettings() {
  const payload = {};
  ['owner_name', 'agency_name', 'website', 'daily_goal'].forEach(k => {
    const el = document.getElementById(`set-${k}`);
    if (el) payload[k] = el.value;
  });

  try {
    await post('/api/settings', payload);
    settings = { ...settings, ...payload };
    toast('Settings saved');
    loadStats(); // refresh goal bar
  } catch (e) {
    toast(`Save failed: ${e.message}`, 'error');
  }
}

async function testEmail() {
  try {
    const r = await post('/api/test/email', {});
    toast(r.message || 'Test email sent');
  } catch (e) {
    toast(`Email test failed: ${e.message}`, 'error');
  }
}

async function testSMS() {
  const to = document.getElementById('testSmsTo').value.trim();
  if (!to) { toast('Enter a phone number first', 'error'); return; }
  try {
    const r = await post('/api/test/sms', { to });
    toast(r.message || 'Test SMS sent');
  } catch (e) {
    toast(`SMS test failed: ${e.message}`, 'error');
  }
}

// ── Stat card click → filter ───────────────────────────────────────────────────

function handleStatClick(card) {
  const filterVal = card.dataset.filter;
  const priVal    = card.dataset.filterPriority;

  document.querySelectorAll('.stat-card').forEach(c => c.classList.remove('active'));
  card.classList.add('active');

  if (priVal) {
    activePriorityFilter = priVal;
    activeStatusFilter   = '';
    document.getElementById('filterPriority').value = priVal;
    document.getElementById('filterStatus').value   = '';
  } else {
    activeStatusFilter   = filterVal || '';
    activePriorityFilter = '';
    document.getElementById('filterStatus').value   = filterVal || '';
    document.getElementById('filterPriority').value = '';
  }
  applyFilters();
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }
  catch { return d; }
}

function fmtDateTime(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); }
  catch { return d; }
}

// ── Event bindings ────────────────────────────────────────────────────────────

function bindEvents() {
  // Logout
  document.getElementById('btnLogout')?.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
  });

  // Theme
  document.getElementById('themeToggle').addEventListener('click', toggleTheme);

  // Nav tabs
  document.querySelectorAll('.nav-tab').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  // Mobile bottom nav
  document.querySelectorAll('.mbn-tab').forEach(btn =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  // Mobile FAB mass actions
  document.getElementById('mobileFabEmail')?.addEventListener('click', openMassEmailModal);
  document.getElementById('mobileFabSMS')?.addEventListener('click', openMassSMSModal);

  // Mobile speed-dial FAB
  const speedDial   = document.getElementById('mobileSpeedDial');
  const msdTrigger  = document.getElementById('msdTrigger');
  const msdBackdrop = document.getElementById('msdBackdrop');
  function closeSpeeddial() { speedDial?.classList.remove('open'); }
  msdTrigger?.addEventListener('click', () => speedDial?.classList.toggle('open'));
  msdBackdrop?.addEventListener('click', closeSpeeddial);
  document.getElementById('msdAddContact')?.addEventListener('click', () => {
    closeSpeeddial(); openAddContactModal();
  });
  document.getElementById('msdImportCSV')?.addEventListener('click', () => {
    closeSpeeddial();
    openImportModal();
    // Switch to CSV tab
    setTimeout(() => {
      document.getElementById('importModeCSV')?.click();
    }, 100);
  });
  document.getElementById('msdScanPhoto')?.addEventListener('click', () => {
    closeSpeeddial();
    openImportModal();
    setTimeout(() => { document.getElementById('importModeOCR')?.click(); }, 100);
  });

  // Search / filters
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(applyFilters, 250);
  });
  document.getElementById('filterStatus').addEventListener('change', e => {
    activeStatusFilter = e.target.value;
    applyFilters();
  });
  document.getElementById('filterPriority').addEventListener('change', e => {
    activePriorityFilter = e.target.value;
    applyFilters();
  });

  // Select all / clear
  document.getElementById('selectAll').addEventListener('change', e => {
    filteredContacts.forEach(c => {
      if (e.target.checked) selectedIds.add(c.id); else selectedIds.delete(c.id);
    });
    renderTable();
    updateMassBar();
  });

  document.getElementById('selectAllUncontacted').addEventListener('click', () => {
    selectedIds.clear();
    allContacts.filter(c => c.status === 'Not Contacted').forEach(c => selectedIds.add(c.id));
    applyFilters();
    updateMassBar();
  });

  document.getElementById('clearSelection').addEventListener('click', () => {
    selectedIds.clear();
    applyFilters();
    updateMassBar();
  });

  // Column sort
  document.querySelectorAll('[data-sort]').forEach(th =>
    th.addEventListener('click', () => handleSort(th.dataset.sort)));

  // Stats bar click-to-filter
  document.querySelectorAll('.stat-card').forEach(card =>
    card.addEventListener('click', () => handleStatClick(card)));

  // Modal close
  document.getElementById('modalClose').addEventListener('click', closeContactModal);
  document.getElementById('contactModal').addEventListener('click', e => {
    if (e.target === document.getElementById('contactModal')) closeContactModal();
  });
  document.getElementById('massEmailModal').addEventListener('click', e => {
    if (e.target === document.getElementById('massEmailModal')) closeModal('massEmailModal');
  });
  document.getElementById('massSMSModal').addEventListener('click', e => {
    if (e.target === document.getElementById('massSMSModal')) closeModal('massSMSModal');
  });

  // Add Contact
  document.getElementById('btnAddContact').addEventListener('click', openAddContactModal);
  document.getElementById('saveNewContact').addEventListener('click', saveNewContact);
  document.getElementById('addContactModal').addEventListener('click', e => {
    if (e.target === document.getElementById('addContactModal')) closeModal('addContactModal');
  });

  // Import CSV + OCR mode toggle (wired here — never rely on inline onclick)
  document.getElementById('btnImportCSV').addEventListener('click', openImportModal);
  document.getElementById('importModeCSV')?.addEventListener('click', () => setImportMode('csv'));
  document.getElementById('importModeOCR')?.addEventListener('click', () => setImportMode('ocr'));
  document.getElementById('importConfirm').addEventListener('click', confirmImport);
  document.getElementById('csvFileInput').addEventListener('change', e => handleCSVFile(e.target.files[0]));
  const dropZone = document.getElementById('importDropZone');
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    handleCSVFile(e.dataTransfer.files[0]);
  });
  document.getElementById('ocrFileInput')?.addEventListener('change', e => handleOCRFiles(e.target.files));
  document.getElementById('ocrCameraCapture')?.addEventListener('change', e => handleOCRFiles(e.target.files));
  const ocrDrop = document.getElementById('ocrDropZone');
  if (ocrDrop) {
    ocrDrop.addEventListener('dragover', e => { e.preventDefault(); ocrDrop.classList.add('drag-over'); });
    ocrDrop.addEventListener('dragleave', () => ocrDrop.classList.remove('drag-over'));
    ocrDrop.addEventListener('drop', e => {
      e.preventDefault();
      ocrDrop.classList.remove('drag-over');
      handleOCRFiles(e.dataTransfer.files);
    });
  }
  document.getElementById('importModal').addEventListener('click', e => {
    if (e.target === document.getElementById('importModal')) closeModal('importModal');
  });

  // Swipe-down to close bottom-sheet modals on mobile
  attachSwipeToClose('contactModal',    closeContactModal);
  attachSwipeToClose('massEmailModal',  () => closeModal('massEmailModal'));
  attachSwipeToClose('massSMSModal',    () => closeModal('massSMSModal'));
  attachSwipeToClose('addContactModal', () => closeModal('addContactModal'));
  attachSwipeToClose('importModal',     () => closeModal('importModal'));

  // Toggle archived
  document.getElementById('toggleArchived').addEventListener('click', toggleArchivedView);

  // Contact modal actions
  document.getElementById('saveContact').addEventListener('click', saveContact);
  document.getElementById('archiveContactBtn').addEventListener('click', archiveContact);
  document.getElementById('saveLog').addEventListener('click', saveLog);
  document.getElementById('generateDraft').addEventListener('click', generateDraft);
  document.getElementById('modalSendEmail').addEventListener('click', sendSingleEmail);
  document.getElementById('modalSendSMS').addEventListener('click', sendSingleSMS);

  // AI tab switching
  document.querySelectorAll('.ai-tab').forEach(btn =>
    btn.addEventListener('click', () => showDraftTab(btn.dataset.draft)));

  // Mass email/SMS open
  document.getElementById('btnMassEmail').addEventListener('click', openMassEmailModal);
  document.getElementById('btnMassSMS').addEventListener('click', openMassSMSModal);
  document.getElementById('massEmailSelected').addEventListener('click', openMassEmailModal);
  document.getElementById('massSMSSelected').addEventListener('click', openMassSMSModal);

  // Mass email send/preview
  document.getElementById('previewMassEmail').addEventListener('click', previewMassEmail);
  document.getElementById('sendMassEmail').addEventListener('click', sendMassEmail);
  document.getElementById('sendMassSMS').addEventListener('click', sendMassSMS);

  // SMS char counter
  document.getElementById('massSMSBody').addEventListener('input', e => {
    document.getElementById('smsCharCount').textContent = `${e.target.value.length} / 160`;
  });

  // Export selected
  document.getElementById('exportSelected').addEventListener('click', e => {
    e.preventDefault();
    if (!selectedIds.size) { toast('Select contacts first', 'error'); return; }
    const ids = [...selectedIds].join(',');
    window.location.href = `/api/export/csv?ids=${ids}`;
  });

  // Settings
  document.getElementById('saveSettings').addEventListener('click', saveSettings);
  document.getElementById('testEmail').addEventListener('click', testEmail);
  document.getElementById('testSMS').addEventListener('click', testSMS);
  document.getElementById('changePasswordBtn')?.addEventListener('click', changePassword);

  // Quick filters
  document.querySelectorAll('.qf-btn').forEach(btn =>
    btn.addEventListener('click', () => applyQuickFilter(btn.dataset.qf, btn)));

  // Pipeline refresh
  document.getElementById('refreshPipeline')?.addEventListener('click', loadPipeline);

  // Tags
  document.getElementById('addTagBtn')?.addEventListener('click', addTag);
  document.getElementById('tagInput')?.addEventListener('keydown', e => { if (e.key === 'Enter') addTag(); });

  // Tasks
  document.getElementById('addTaskBtn')?.addEventListener('click', addTask);

  // Keyboard close modals
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (!document.getElementById('contactModal').classList.contains('hidden'))    closeContactModal();
    if (!document.getElementById('massEmailModal').classList.contains('hidden')) closeModal('massEmailModal');
    if (!document.getElementById('massSMSModal').classList.contains('hidden'))   closeModal('massSMSModal');
    if (!document.getElementById('addContactModal').classList.contains('hidden')) closeModal('addContactModal');
    if (!document.getElementById('importModal').classList.contains('hidden'))    closeModal('importModal');
  });

  // Enter key in add contact name field submits
  document.getElementById('addName').addEventListener('keydown', e => {
    if (e.key === 'Enter') saveNewContact();
  });
}

// ── Add Contact ───────────────────────────────────────────────────────────────

function openAddContactModal() {
  document.body.style.overflow = 'hidden';
  ['addName','addBusiness','addPhone','addEmail','addNotes'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const src = document.getElementById('addSource');
  const pri = document.getElementById('addPriority');
  if (src) src.value = 'Manual';
  if (pri) pri.value = 'Normal';
  document.getElementById('addContactModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('addName').focus(), 50);
}

async function saveNewContact() {
  const name = (document.getElementById('addName').value || '').trim();
  if (!name) { toast('Name is required', 'error'); return; }

  const btn = document.getElementById('saveNewContact');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const result = await post('/api/contacts', {
      name,
      business: (document.getElementById('addBusiness').value || '').trim(),
      phone:    (document.getElementById('addPhone').value    || '').trim(),
      email:    (document.getElementById('addEmail').value    || '').trim(),
      source:   document.getElementById('addSource').value,
      priority: document.getElementById('addPriority').value,
      notes:    (document.getElementById('addNotes').value    || '').trim(),
    });
    allContacts.unshift(result.contact);
    applyFilters();
    loadStats();
    closeModal('addContactModal');
    toast(`${name} added`);
  } catch (e) {
    toast(`Failed to add: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Contact';
  }
}

// ── Archive / Unarchive contact ───────────────────────────────────────────────

async function archiveContact() {
  if (!currentContactId) return;
  const c = allContacts.find(x => x.id === currentContactId);
  if (!c) return;
  const isArchived = !!c.archived;

  if (!isArchived && !confirm(`Archive ${c.name}? They'll be hidden from the table (use "Show Archived" to find them).`)) return;

  try {
    if (isArchived) {
      await post(`/api/contacts/${currentContactId}/unarchive`, {});
    } else {
      await fetch(`/api/contacts/${currentContactId}`, { method: 'DELETE' });
    }
    const idx = allContacts.findIndex(x => x.id === currentContactId);
    if (idx !== -1) allContacts[idx].archived = isArchived ? 0 : 1;
    applyFilters();
    loadStats();
    closeContactModal();
    toast(isArchived ? `${c.name} restored` : `${c.name} archived`);
  } catch (e) {
    toast(`Failed: ${e.message}`, 'error');
  }
}

// ── Toggle archived view ──────────────────────────────────────────────────────

async function toggleArchivedView() {
  showArchived = !showArchived;
  const btn = document.getElementById('toggleArchived');
  btn.textContent = showArchived ? 'Hide Archived' : 'Show Archived';
  btn.classList.toggle('active-filter', showArchived);
  await loadContacts();
}

// ── Import CSV ────────────────────────────────────────────────────────────────

function openImportModal() {
  document.body.style.overflow = 'hidden';
  importedContacts = [];
  const fi = document.getElementById('csvFileInput');
  if (fi) fi.value = '';
  document.getElementById('importPreview').style.display = 'none';
  document.getElementById('importConfirm').disabled = true;
  setImportMode('csv'); // always reset to CSV mode on open
  document.getElementById('importModal').classList.remove('hidden');
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else inQuote = !inQuote;
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function parseCSV(text) {
  // Normalize line endings
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().split('\n').filter(Boolean);
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/^"|"$/g, ''));
  const idx = {
    name:  headers.findIndex(h => h.includes('name')),
    biz:   headers.findIndex(h => h.includes('busi') || h.includes('company') || h.includes('org')),
    phone: headers.findIndex(h => h.includes('phone') || h.includes('tel') || h.includes('mobile')),
    email: headers.findIndex(h => h.includes('email') || h.includes('e-mail')),
    notes: headers.findIndex(h => h.includes('note')),
  };

  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    return {
      name:     idx.name  >= 0 ? (vals[idx.name]  || '') : '',
      business: idx.biz   >= 0 ? (vals[idx.biz]   || '') : '',
      phone:    idx.phone >= 0 ? (vals[idx.phone]  || '') : '',
      email:    idx.email >= 0 ? (vals[idx.email]  || '') : '',
      notes:    idx.notes >= 0 ? (vals[idx.notes]  || '') : '',
      source:   'CSV Import',
    };
  }).filter(c => c.name.trim());
}

function handleCSVFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    importedContacts = parseCSV(e.target.result);
    const count = importedContacts.length;
    document.getElementById('importPreviewCount').textContent =
      `${count} contact${count !== 1 ? 's' : ''} found — ready to import`;

    const tbody = document.getElementById('importPreviewBody');
    tbody.innerHTML = importedContacts.slice(0, 20).map(c => `
      <tr>
        <td>${esc(c.name)}</td>
        <td>${esc(c.business)}</td>
        <td>${esc(c.phone)}</td>
        <td>${esc(c.email)}</td>
      </tr>`).join('');
    if (count > 20) {
      tbody.innerHTML += `<tr><td colspan="4" class="import-more">... and ${count - 20} more</td></tr>`;
    }
    document.getElementById('importPreview').style.display = count ? 'block' : 'none';
    document.getElementById('importConfirm').disabled = count === 0;
  };
  reader.readAsText(file);
}

async function confirmImport() {
  if (!importedContacts.length) return;
  const btn = document.getElementById('importConfirm');
  btn.disabled = true;
  btn.textContent = 'Importing...';
  try {
    const result = await post('/api/contacts/import', { contacts: importedContacts });
    toast(`${result.added} added${result.skipped ? `, ${result.skipped} skipped (duplicate)` : ''}`);
    closeModal('importModal');
    await loadContacts();
    loadStats();
  } catch (e) {
    toast(`Import failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import Contacts';
  }
}

// ── Auto-prioritize high-potential contacts ───────────────────────────────────

async function changePassword() {
  const current  = document.getElementById('pwCurrent').value;
  const newPw    = document.getElementById('pwNew').value;
  const confirm  = document.getElementById('pwConfirm').value;
  const msg      = document.getElementById('pwMsg');

  msg.className = 'msg';
  msg.textContent = '';

  if (!current || !newPw || !confirm) { msg.textContent = 'All three fields required.'; msg.className = 'msg err'; return; }
  if (newPw.length < 8)               { msg.textContent = 'New password must be at least 8 characters.'; msg.className = 'msg err'; return; }
  if (newPw !== confirm)              { msg.textContent = 'New passwords do not match.'; msg.className = 'msg err'; return; }

  const btn = document.getElementById('changePasswordBtn');
  btn.disabled = true; btn.textContent = 'Updating...';

  try {
    await post('/api/auth/change-password', { currentPassword: current, newPassword: newPw });
    msg.textContent = 'Password updated.';
    msg.className = 'msg ok';
    document.getElementById('pwCurrent').value = '';
    document.getElementById('pwNew').value = '';
    document.getElementById('pwConfirm').value = '';
  } catch (e) {
    msg.textContent = e.message;
    msg.className = 'msg err';
  } finally {
    btn.disabled = false; btn.textContent = 'Update Password';
  }
}

async function autoPrioritize() {
  try {
    await post('/api/contacts/auto-prioritize', {});
  } catch (_) {}
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIER 2 — PIPELINE BOARD
// ═══════════════════════════════════════════════════════════════════════════════

const PIPELINE_STAGE_STATUS = {
  'Not Contacted': 'Not Contacted',
  'Reached Out':   'Called',
  'Interested':    'Pitched',
  'Proposal Sent': 'Proposal Sent',
  'Closed Won':    'Client',
  'Closed Lost':   'Not Interested',
};

const PIPELINE_COL_CLASS = {
  'Closed Won':  'col-won',
  'Closed Lost': 'col-lost',
};

async function loadPipeline() {
  const board = document.getElementById('pipelineBoard');
  if (!board) return;
  try {
    const data = await get('/api/pipeline');
    board.innerHTML = '';
    for (const [stage, info] of Object.entries(data)) {
      const extraClass = PIPELINE_COL_CLASS[stage] || '';
      const total = info.total > 0 ? `<span>$${info.total.toLocaleString()}</span>` : '';
      const col = document.createElement('div');
      col.className = `pipeline-col ${extraClass}`;
      col.dataset.stage = stage;
      col.innerHTML = `
        <div class="pipeline-col-header">
          <div class="pipeline-col-title">${esc(stage)}</div>
          <div class="pipeline-col-meta">${info.contacts.length} contact${info.contacts.length !== 1 ? 's' : ''} ${total}</div>
        </div>
        <div class="pipeline-col-body" data-stage="${esc(stage)}">
          ${info.contacts.length === 0
            ? '<div class="pipeline-empty">Drop here</div>'
            : info.contacts.map(c => pipelineCard(c)).join('')}
        </div>`;
      board.appendChild(col);
    }
    bindPipelineDrag();
  } catch (e) {
    board.innerHTML = `<div style="color:var(--red);padding:20px">${e.message}</div>`;
  }
}

function pipelineCard(c) {
  const priority = c.priority === 'Hot' ? `<span class="priority-pill priority-hot">Hot</span>`
    : c.priority === 'Warm' ? `<span class="priority-pill priority-warm">Warm</span>` : '';
  const value = c.deal_value > 0 ? `<span class="pipeline-card-value">$${Number(c.deal_value).toLocaleString()}</span>` : '<span></span>';
  return `<div class="pipeline-card" draggable="true" data-id="${c.id}">
    <div class="pipeline-card-name">${esc(c.name)}</div>
    <div class="pipeline-card-biz">${esc(c.business || '—')}</div>
    <div class="pipeline-card-footer">${value}${priority}</div>
  </div>`;
}

function bindPipelineDrag() {
  let dragId = null;

  document.querySelectorAll('.pipeline-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      dragId = card.dataset.id;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('click', () => openModal(parseInt(card.dataset.id)));
  });

  document.querySelectorAll('.pipeline-col-body').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async e => {
      e.preventDefault();
      col.classList.remove('drag-over');
      if (!dragId) return;
      const stage  = col.dataset.stage;
      const status = PIPELINE_STAGE_STATUS[stage];
      if (!status) return;
      try {
        await put(`/api/contacts/${dragId}`, { status });
        toast(`Moved to ${stage}`, 'success');
        loadPipeline();
        loadStats();
        loadContacts();
      } catch (err) { toast(err.message, 'error'); }
    });
  });

  // ── Touch drag for mobile ────────────────────────────────────────────────
  let touchDragId = null, touchGhost = null, touchOffsetX = 0, touchOffsetY = 0, lastTouchedCol = null;
  let scrollRAF = null, scrollDir = 0, currentTouchX = 0;
  const EDGE_ZONE = 72, SCROLL_SPEED = 14;

  // Continuous RAF scroll loop — smooth edge-scroll while dragging
  function startScrollLoop(board) {
    if (scrollRAF) return;
    function loop() {
      if (!touchDragId || scrollDir === 0) { scrollRAF = null; return; }
      board.scrollLeft += scrollDir * SCROLL_SPEED;
      scrollRAF = requestAnimationFrame(loop);
    }
    scrollRAF = requestAnimationFrame(loop);
  }
  function stopScrollLoop() {
    if (scrollRAF) { cancelAnimationFrame(scrollRAF); scrollRAF = null; }
    scrollDir = 0;
  }

  document.querySelectorAll('.pipeline-card').forEach(card => {
    card.addEventListener('touchstart', e => {
      if (e.touches.length !== 1) return;
      touchDragId = card.dataset.id;
      const rect = card.getBoundingClientRect();
      touchOffsetX = e.touches[0].clientX - rect.left;
      touchOffsetY = e.touches[0].clientY - rect.top;
      touchGhost = card.cloneNode(true);
      touchGhost.style.cssText = `position:fixed;pointer-events:none;z-index:9998;width:${rect.width}px;opacity:.85;left:${rect.left}px;top:${rect.top}px;box-shadow:0 8px 24px rgba(0,0,0,.5);border:1px solid var(--gold-line);border-radius:8px;transform:scale(1.04);`;
      document.body.appendChild(touchGhost);
      card.style.opacity = '0.3';
      // Disable scroll-snap during drag so scrollLeft works freely
      const board = document.querySelector('.pipeline-board');
      if (board) board.style.scrollSnapType = 'none';
    }, { passive: true });

    card.addEventListener('touchmove', e => {
      if (!touchDragId || !touchGhost) return;
      e.preventDefault();
      const t = e.touches[0];
      currentTouchX = t.clientX;
      touchGhost.style.left = `${t.clientX - touchOffsetX}px`;
      touchGhost.style.top  = `${t.clientY - touchOffsetY}px`;

      // Edge-scroll detection — set direction, RAF loop does the actual scrolling
      const board = document.querySelector('.pipeline-board');
      if (board) {
        const boardRect = board.getBoundingClientRect();
        if (t.clientX < boardRect.left + EDGE_ZONE) {
          scrollDir = -1;
          startScrollLoop(board);
        } else if (t.clientX > boardRect.right - EDGE_ZONE) {
          scrollDir = 1;
          startScrollLoop(board);
        } else {
          stopScrollLoop();
        }
      }

      touchGhost.style.display = 'none';
      const el = document.elementFromPoint(t.clientX, t.clientY);
      touchGhost.style.display = '';
      const col = el?.closest('.pipeline-col-body');
      if (lastTouchedCol && lastTouchedCol !== col) lastTouchedCol.classList.remove('drag-over');
      if (col) { col.classList.add('drag-over'); lastTouchedCol = col; }
    }, { passive: false });

    card.addEventListener('touchend', async e => {
      stopScrollLoop();
      if (!touchDragId) return;
      if (touchGhost) { touchGhost.remove(); touchGhost = null; }
      const origCard = document.querySelector(`.pipeline-card[data-id="${touchDragId}"]`);
      if (origCard) origCard.style.opacity = '';
      if (lastTouchedCol) lastTouchedCol.classList.remove('drag-over');
      // Re-enable scroll-snap
      const board = document.querySelector('.pipeline-board');
      if (board) board.style.scrollSnapType = '';
      const t = e.changedTouches[0];
      const el = document.elementFromPoint(t.clientX, t.clientY);
      const col = el?.closest('.pipeline-col-body');
      const id = touchDragId;
      touchDragId = null; lastTouchedCol = null;
      if (!col) return;
      const stage = col.dataset.stage;
      const status = PIPELINE_STAGE_STATUS[stage];
      if (!status) return;
      try {
        await put(`/api/contacts/${id}`, { status });
        toast(`Moved to ${stage}`, 'success');
        loadPipeline(); loadStats(); loadContacts();
      } catch (err) { toast(err.message, 'error'); }
    }, { passive: true });
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIER 2 — TAGS
// ═══════════════════════════════════════════════════════════════════════════════

async function loadContactTags(contactId) {
  const list = document.getElementById('modalTagsList');
  if (!list) return;
  try {
    const tags = await get(`/api/contacts/${contactId}/tags`);
    renderTagsList(tags, contactId);
  } catch (_) { list.innerHTML = ''; }
}

function renderTagsList(tags, contactId) {
  const list = document.getElementById('modalTagsList');
  if (!list) return;
  if (!tags.length) { list.innerHTML = '<span style="font-size:12px;color:var(--muted)">No tags yet</span>'; return; }
  list.innerHTML = tags.map(t => `
    <span class="tag-pill">
      ${esc(t.tag)}
      <button type="button" aria-label="Remove tag ${esc(t.tag)}" onclick="removeTag(${contactId},'${esc(t.tag)}')">×</button>
    </span>`).join('');
}

async function addTag() {
  if (!currentContactId) return;
  const input = document.getElementById('tagInput');
  const tag = input.value.trim();
  if (!tag) return;
  try {
    await post(`/api/contacts/${currentContactId}/tags`, { tag });
    input.value = '';
    loadContactTags(currentContactId);
  } catch (e) { toast(e.message, 'error'); }
}

async function removeTag(contactId, tag) {
  try {
    await api(`/api/contacts/${contactId}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
    loadContactTags(contactId);
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIER 2 — TASKS / REMINDERS
// ═══════════════════════════════════════════════════════════════════════════════

async function loadTodayTasks() {
  const panel = document.getElementById('tasksTodayPanel');
  if (!panel) return;
  try {
    const [dueTasks, overdueTasks] = await Promise.all([
      get('/api/tasks?filter=due_today'),
      get('/api/tasks?filter=overdue'),
    ]);
    const all = [...overdueTasks, ...dueTasks];
    if (!all.length) { panel.innerHTML = ''; return; }
    panel.innerHTML = `
      <div class="tasks-today-header">
        <strong style="font-size:13px">Follow-ups${overdueTasks.length ? ` <span style="color:var(--red)">(${overdueTasks.length} overdue)</span>` : ''}</strong>
        <span style="font-size:12px;color:var(--muted)">${all.length} task${all.length !== 1 ? 's' : ''} due</span>
      </div>
      ${all.map(t => taskTodayHTML(t)).join('')}`;
  } catch (_) { panel.innerHTML = ''; }
}

function taskTodayHTML(t) {
  const isOverdue = t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
  const meta = t.contact_name ? `${t.contact_name}${t.due_date ? ' · ' + fmtDate(t.due_date) : ''}` : fmtDate(t.due_date);
  return `<div class="task-today-item${isOverdue ? ' overdue' : ''}">
    <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="completeTask(${t.id}, this.checked)">
    <div style="flex:1">
      <div class="task-today-title${t.completed ? ' done' : ''}">${esc(t.title)}</div>
      <div class="task-today-meta${isOverdue ? ' overdue' : ''}">${esc(meta)}</div>
    </div>
    ${t.contact_id ? `<button type="button" class="btn btn-outline btn-sm" onclick="openModal(${t.contact_id})">View</button>` : ''}
  </div>`;
}

async function loadContactTasks(contactId) {
  const list = document.getElementById('contactTasksList');
  if (!list) return;
  try {
    const tasks = await get(`/api/tasks?contactId=${contactId}`);
    if (!tasks.length) { list.innerHTML = ''; return; }
    list.innerHTML = `<div class="contact-tasks-list">${tasks.map(t => taskItemHTML(t)).join('')}</div>`;
  } catch (_) { list.innerHTML = ''; }
}

function taskItemHTML(t) {
  const isOverdue = !t.completed && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString());
  return `<div class="task-item" id="task-${t.id}">
    <input type="checkbox" ${t.completed ? 'checked' : ''} onchange="completeTask(${t.id}, this.checked)">
    <span class="task-item-title${t.completed ? ' done' : ''}">${esc(t.title)}</span>
    ${t.due_date ? `<span class="task-item-due${isOverdue ? ' overdue' : ''}">${fmtDate(t.due_date)}</span>` : ''}
    <button type="button" class="task-item-del" onclick="deleteTask(${t.id})" aria-label="Delete task">×</button>
  </div>`;
}

async function addTask() {
  if (!currentContactId) return;
  const title   = document.getElementById('taskTitle').value.trim();
  const dueDate = document.getElementById('taskDueDate').value;
  if (!title) { toast('Enter a task first', 'error'); return; }
  try {
    await post('/api/tasks', { contactId: currentContactId, title, dueDate: dueDate || null });
    document.getElementById('taskTitle').value   = '';
    document.getElementById('taskDueDate').value = '';
    loadContactTasks(currentContactId);
    loadTodayTasks();
    toast('Reminder added', 'success');
  } catch (e) { toast(e.message, 'error'); }
}

async function completeTask(id, completed) {
  try {
    await put(`/api/tasks/${id}`, { completed });
    if (currentContactId) loadContactTasks(currentContactId);
    loadTodayTasks();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteTask(id) {
  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    if (currentContactId) loadContactTasks(currentContactId);
    loadTodayTasks();
  } catch (e) { toast(e.message, 'error'); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIER 2 — QUICK FILTERS
// ═══════════════════════════════════════════════════════════════════════════════

let activeQuickFilter = '';

function applyQuickFilter(qf, btn) {
  activeQuickFilter = qf;
  document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyFilters();
}

// ═══════════════════════════════════════════════════════════════════════════════
// TIER 2 — REPORTS & ANALYTICS
// ═══════════════════════════════════════════════════════════════════════════════

async function loadReports() {
  loadReportsSummary();
  loadActivityHeatmap();
  loadAllTasks();
}

async function loadReportsSummary() {
  try {
    const d = await get('/api/reports/summary');
    document.getElementById('rpt-convrate').textContent = `${d.conversionRate}%`;
    document.getElementById('rpt-clients').textContent  = d.clients;
    document.getElementById('rpt-hot').textContent      = d.hot;
    document.getElementById('rpt-value').textContent    = d.totalPipelineValue > 0
      ? `$${Number(d.totalPipelineValue).toLocaleString()}` : '$0';

    renderBarChart('statusBarChart',   d.byStatus,   'status',   d.total);
    renderBarChart('priorityBarChart', d.byPriority, 'priority', d.total);
  } catch (_) {}
}

function renderBarChart(containerId, rows, key, total) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const colors = {
    'Not Contacted': 'var(--muted)', 'Called': 'var(--blue)', 'Emailed': 'var(--blue)',
    'Texted': 'var(--blue)', 'Pitched': 'var(--yellow)', 'Proposal Sent': 'var(--purple)',
    'Client': 'var(--green)', 'Not Interested': 'var(--red)',
    'Hot': 'var(--red)', 'Warm': 'var(--yellow)', 'Normal': 'var(--muted)', 'Cold': 'var(--border)',
  };
  el.innerHTML = rows.map(r => {
    const pct  = total > 0 ? Math.round((r.c / total) * 100) : 0;
    const color = colors[r[key]] || 'var(--gold)';
    return `<div class="bar-row">
      <div class="bar-label" title="${esc(r[key])}">${esc(r[key])}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="bar-count">${r.c}</div>
    </div>`;
  }).join('');
}

async function loadActivityHeatmap() {
  const wrap = document.getElementById('activityHeatmap');
  if (!wrap) return;
  try {
    const rows = await get('/api/reports/activity');
    const map  = {};
    rows.forEach(r => { map[r.day] = r.count; });

    const maxCount = Math.max(...Object.values(map), 1);
    const cells = [];
    for (let i = 29; i >= 0; i--) {
      const d   = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().split('T')[0];
      const cnt = map[key] || 0;
      const lvl = cnt === 0 ? '' : cnt <= maxCount * 0.25 ? 'l1' : cnt <= maxCount * 0.5 ? 'l2' : cnt <= maxCount * 0.75 ? 'l3' : 'l4';
      const label = i % 7 === 0 ? d.toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '';
      cells.push(`<div class="heatmap-day">
        <div class="heatmap-cell ${lvl}" title="${key}: ${cnt} interaction${cnt !== 1 ? 's' : ''}"></div>
        <div class="heatmap-date">${esc(label)}</div>
      </div>`);
    }
    wrap.innerHTML = `<div class="heatmap">${cells.join('')}</div>`;
  } catch (_) {}
}

async function loadAllTasks() {
  const el = document.getElementById('allTasksList');
  if (!el) return;
  try {
    const tasks = await get('/api/tasks');
    if (!tasks.length) { el.innerHTML = '<div class="all-tasks-empty">No tasks yet. Add reminders from any contact card.</div>'; return; }

    const overdue    = tasks.filter(t => !t.completed && t.due_date && new Date(t.due_date) < new Date(new Date().toDateString()));
    const dueToday   = tasks.filter(t => !t.completed && t.due_date && new Date(t.due_date).toDateString() === new Date().toDateString());
    const upcoming   = tasks.filter(t => !t.completed && (!t.due_date || new Date(t.due_date) > new Date()));
    const completed  = tasks.filter(t => t.completed);

    let html = '';
    if (overdue.length)   html += `<div class="task-section-label" style="color:var(--red)">Overdue (${overdue.length})</div>${overdue.map(t => taskItemHTML(t)).join('')}`;
    if (dueToday.length)  html += `<div class="task-section-label" style="color:var(--yellow)">Due Today (${dueToday.length})</div>${dueToday.map(t => taskItemHTML(t)).join('')}`;
    if (upcoming.length)  html += `<div class="task-section-label">Upcoming (${upcoming.length})</div>${upcoming.map(t => taskItemHTML(t)).join('')}`;
    if (completed.length) html += `<div class="task-section-label">Completed (${completed.length})</div>${completed.map(t => taskItemHTML(t)).join('')}`;
    el.innerHTML = `<div class="contact-tasks-list">${html}</div>`;
  } catch (_) {}
}

// ── Lead Generator ────────────────────────────────────────────────────────────

let generatedLeads = [];

function loadLeadGen() {
  const btn = document.getElementById('btnGenerateLeads');
  if (btn && !btn._lgBound) {
    btn._lgBound = true;
    btn.addEventListener('click', generateLeads);
    document.getElementById('btnImportLeads')?.addEventListener('click', importGeneratedLeads);
  }
}

async function generateLeads() {
  const industry = document.getElementById('lgIndustry').value.trim();
  const location = document.getElementById('lgLocation').value.trim() || 'Columbia, SC';
  const count    = parseInt(document.getElementById('lgCount').value, 10) || 20;
  const context  = document.getElementById('lgContext').value.trim();
  const status   = document.getElementById('lgStatus');
  const results  = document.getElementById('lgResults');
  const bar      = document.getElementById('lgImportBar');

  if (!industry) { toast('Enter an industry first', 'error'); return; }

  const btn = document.getElementById('btnGenerateLeads');
  btn.disabled = true;
  btn.textContent = 'Generating...';
  status.textContent = 'AI is building your prospect list...';
  results.innerHTML  = '<div style="text-align:center;padding:20px"><div class="spinner" style="margin:0 auto 8px"></div>Working...</div>';
  bar.style.display  = 'none';

  try {
    const data = await post('/api/leads/generate', { industry, location, count, context });
    generatedLeads = data.leads || [];
    if (!generatedLeads.length) {
      results.innerHTML = '<div style="color:var(--muted);font-size:13px">No leads returned. Try a different industry.</div>';
      status.textContent = '';
      return;
    }
    results.innerHTML = generatedLeads.map((l, i) => `
      <div style="padding:10px 0;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:2px">
        <div style="font-weight:600;font-size:13px">${esc(l.name || '—')}</div>
        <div style="font-size:12px;color:var(--muted)">${esc(l.business || '')}${l.business && l.phone ? ' · ' : ''}${esc(l.phone || '')}${l.email ? ' · ' + esc(l.email) : ''}</div>
        ${l.notes ? `<div style="font-size:11px;color:var(--muted);font-style:italic">${esc(l.notes)}</div>` : ''}
      </div>`).join('');
    status.textContent = `${generatedLeads.length} prospects generated`;
    bar.style.display  = 'block';
    document.getElementById('lgImportStatus').textContent = '';
  } catch (e) {
    results.innerHTML = `<div style="color:var(--red);font-size:13px">Error: ${esc(e.message)}</div>`;
    status.textContent = '';
  } finally {
    btn.disabled = false;
    btn.textContent = '✨ Generate Leads';
  }
}

async function importGeneratedLeads() {
  if (!generatedLeads.length) return;
  const btn    = document.getElementById('btnImportLeads');
  const status = document.getElementById('lgImportStatus');
  btn.disabled = true;
  btn.textContent = 'Importing...';
  try {
    const result = await post('/api/contacts/import', { contacts: generatedLeads });
    status.textContent = `${result.added} added${result.skipped ? `, ${result.skipped} skipped` : ''}`;
    toast(`${result.added} leads imported`);
    await loadContacts();
    loadStats();
    generatedLeads = [];
    document.getElementById('lgImportBar').style.display = 'none';
  } catch (e) {
    toast(`Import failed: ${e.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Import All to Contacts';
  }
}

// ── Photo OCR Import ──────────────────────────────────────────────────────────

function setImportMode(mode) {
  const csvPane = document.getElementById('importCSVPane');
  const ocrPane = document.getElementById('importOCRPane');
  const csvBtn  = document.getElementById('importModeCSV');
  const ocrBtn  = document.getElementById('importModeOCR');
  if (mode === 'csv') {
    csvPane.style.display = 'block';
    ocrPane.style.display = 'none';
    csvBtn.className = 'btn btn-gold btn-sm';
    ocrBtn.className = 'btn btn-outline btn-sm';
  } else {
    csvPane.style.display = 'none';
    ocrPane.style.display = 'block';
    csvBtn.className = 'btn btn-outline btn-sm';
    ocrBtn.className = 'btn btn-gold btn-sm';
  }
  importedContacts = [];
  document.getElementById('importPreview').style.display = 'none';
  document.getElementById('importConfirm').disabled = true;
}
window.setImportMode = setImportMode;

async function handleOCRFiles(fileList) {
  const files = Array.from(fileList || []).filter(f => f.type.startsWith('image/'));
  if (!files.length) { toast('Please select at least one image file', 'error'); return; }

  const ocrStatus = document.getElementById('ocrStatus');
  ocrStatus.style.display = 'block';
  importedContacts = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const statusText = document.getElementById('ocrStatusText');
    if (statusText) statusText.textContent = `Scanning photo ${i + 1} of ${files.length} with AI...`;

    try {
      const base64 = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result.split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const data = await post('/api/contacts/ocr', { image: base64, mimeType: file.type });
      const found = data.contacts || [];
      importedContacts.push(...found);
    } catch (err) {
      toast(`Photo ${i + 1} failed: ${err.message}`, 'error');
    }
  }

  ocrStatus.style.display = 'none';
  const count = importedContacts.length;
  const photoLabel = files.length > 1 ? ` from ${files.length} photos` : ' from photo';
  document.getElementById('importPreviewCount').textContent =
    `${count} contact${count !== 1 ? 's' : ''} extracted${photoLabel}`;
  const tbody = document.getElementById('importPreviewBody');
  tbody.innerHTML = importedContacts.slice(0, 50).map(c => `
    <tr>
      <td>${esc(c.name)}</td>
      <td>${esc(c.business)}</td>
      <td>${esc(c.phone)}</td>
      <td>${esc(c.email)}</td>
    </tr>`).join('');
  document.getElementById('importPreview').style.display = count ? 'block' : 'none';
  document.getElementById('importConfirm').disabled = count === 0;
  if (!count) toast('No contacts found. Try clearer screenshots.', 'error');
}
window.handleOCRFiles = handleOCRFiles;
window.handleOCRFile = f => handleOCRFiles([f]); // backward compat

// ══════════════════════════════════════════════════════════════════════════════
// SMS INBOX — 2-way conversations
// ══════════════════════════════════════════════════════════════════════════════

let inboxActiveContactId  = null;
let inboxActivePhone      = null;  // for unknown senders

async function loadInbox() {
  try {
    const { threads, unknowns } = await get('/api/sms/inbox');
    renderInboxThreads(threads, unknowns);
    refreshInboxBadge();
  } catch (e) {
    document.getElementById('inboxThreads').innerHTML =
      `<div style="padding:20px;color:var(--muted);font-size:.85rem">Failed to load inbox: ${e.message}</div>`;
  }
}

function renderInboxThreads(threads, unknowns) {
  const container = document.getElementById('inboxThreads');
  const all = [...(threads || []), ...(unknowns || [])];

  if (!all.length) {
    container.innerHTML = `<div style="padding:32px;text-align:center;color:var(--muted);font-size:.85rem">No SMS conversations yet.<br>When someone texts your Twilio number they'll appear here.</div>`;
    return;
  }

  container.innerHTML = all.map(t => {
    const isActive = t.contact_id && t.contact_id === inboxActiveContactId;
    const unread   = t.unread > 0;
    const time     = t.last_at ? new Date(t.last_at).toLocaleDateString('en-US', { month:'short', day:'numeric' }) : '';
    const preview  = (t.last_message || '').substring(0, 55) + (t.last_message?.length > 55 ? '…' : '');
    const isOut    = t.last_direction === 'outbound';
    return `<div class="inbox-thread${isActive ? ' active' : ''}" onclick="openInboxThread(${JSON.stringify(t.contact_id)}, ${JSON.stringify(t.phone)})"
      style="padding:14px 16px;border-bottom:1px solid var(--border);cursor:pointer;background:${isActive ? 'rgba(201,168,76,.12)' : 'transparent'};transition:background .15s">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
        <span style="font-weight:${unread ? '700' : '500'};color:var(--text);font-size:.9rem">${esc(t.name || t.phone)}</span>
        <span style="font-size:.72rem;color:var(--muted)">${time}</span>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.8rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px">${isOut ? 'You: ' : ''}${esc(preview)}</span>
        ${unread ? `<span style="background:var(--gold,#C9A84C);color:#000;border-radius:9px;font-size:.65rem;font-weight:700;padding:1px 6px;margin-left:6px;flex-shrink:0">${t.unread}</span>` : ''}
      </div>
    </div>`;
  }).join('');
}

async function openInboxThread(contactId, phone) {
  inboxActiveContactId = contactId;
  inboxActivePhone     = phone;

  // Highlight active thread
  document.querySelectorAll('.inbox-thread').forEach((el, i) => {
    el.style.background = 'transparent';
  });

  try {
    const url = contactId ? `/api/sms/thread/${contactId}` : `/api/sms/thread/unknown/${encodeURIComponent(phone)}`;
    const { contact, messages } = await get(url);

    document.getElementById('inboxConvName').textContent = contact.name || phone;
    document.getElementById('inboxConvSub').textContent  = contact.business ? `${contact.business} · ${contact.phone}` : contact.phone || '';

    const box = document.getElementById('inboxMessages');
    if (!messages.length) {
      box.innerHTML = `<div style="text-align:center;color:var(--muted);font-size:.85rem;margin:auto">No messages yet. Send the first one.</div>`;
    } else {
      box.innerHTML = messages.map(m => {
        const out  = m.direction === 'outbound';
        const time = new Date(m.created_at).toLocaleString('en-US', { month:'short', day:'numeric', hour:'numeric', minute:'2-digit' });
        return `<div style="display:flex;flex-direction:column;align-items:${out ? 'flex-end' : 'flex-start'}">
          <div style="max-width:72%;background:${out ? 'var(--gold,#C9A84C)' : 'var(--card)'};color:${out ? '#000' : 'var(--text)'};padding:10px 14px;border-radius:${out ? '16px 16px 4px 16px' : '16px 16px 16px 4px'};font-size:.88rem;line-height:1.5;word-break:break-word">${esc(m.body)}</div>
          <span style="font-size:.7rem;color:var(--muted);margin-top:3px">${time}</span>
        </div>`;
      }).join('');
      box.scrollTop = box.scrollHeight;
    }

    refreshInboxBadge();
    // Re-render thread list to clear unread badges
    loadInbox();
  } catch (e) {
    toast('Failed to load thread: ' + e.message, 'error');
  }
}

async function sendInboxReply() {
  if (!inboxActiveContactId && !inboxActivePhone) { toast('Select a conversation first', 'error'); return; }
  const body = (document.getElementById('inboxReplyText').value || '').trim();
  if (!body) return;

  const btn = document.getElementById('inboxSendBtn');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    const contact = inboxActiveContactId
      ? allContacts.find(c => c.id === inboxActiveContactId)
      : null;
    const to = contact?.phone || inboxActivePhone;

    await post('/api/sms/send', { contactId: inboxActiveContactId || undefined, to, body });
    document.getElementById('inboxReplyText').value = '';
    toast('Sent');
    // Reload thread
    await openInboxThread(inboxActiveContactId, inboxActivePhone);
  } catch (e) {
    toast('Send failed: ' + e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send';
  }
}

async function refreshInboxBadge() {
  try {
    const { count } = await get('/api/sms/unread-count');
    const badge = document.getElementById('inboxBadge');
    if (badge) {
      if (count > 0) { badge.textContent = count; badge.style.display = 'inline'; }
      else { badge.style.display = 'none'; }
    }
  } catch (_) {}
}

// Poll for new inbound messages every 30s when inbox tab is active
setInterval(() => {
  if (document.getElementById('tab-inbox') && !document.getElementById('tab-inbox').classList.contains('hidden')) {
    loadInbox();
    if (inboxActiveContactId) openInboxThread(inboxActiveContactId, inboxActivePhone);
  } else {
    refreshInboxBadge(); // always keep badge count fresh
  }
}, 30000);

// Kick off badge on load
document.addEventListener('DOMContentLoaded', () => setTimeout(refreshInboxBadge, 2000));

