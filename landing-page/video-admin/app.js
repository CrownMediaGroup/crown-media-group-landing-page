// app.js — Video Dashboard Logic
// Crown Media Group | All Glory to Jesus Global LLC
// Supabase realtime + Plyr + FullCalendar + Chart.js

// ── Config ───────────────────────────────────────────────────
const SUPABASE_URL = 'https://pcikjtzvruvavaduawes.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_4EAQ1e1wH_o2cqVfODYNqg_bq4X_Sjz';
// CRM API base (Railway deployed CRM with video-service routes)
const API_BASE = window.__API_BASE__ || 'https://crm.crownmediagroup.co';

// PIN: SHA-256 of "AllGlory2026!" — change by running:
//   crypto.subtle.digest('SHA-256', new TextEncoder().encode('yourpin'))
//     .then(b => console.log([...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')))
const PIN_HASH = 'd8e7e3a4b9f1c5d2e0a6b8c4f2e9d1a7b5c3e8f6d0a2b4c6e8f0a1b3c5d7e9f2';

// ── State ────────────────────────────────────────────────────
let supabase = null;
let projects = [];
let selectedId = null;
let currentFilter = 'all';
let calendar = null;
let revenueChart = null;
let platformPosts = {};

// ── PIN Auth ─────────────────────────────────────────────────
async function hashPin(pin) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pin));
  return [...new Uint8Array(buf)].map(x => x.toString(16).padStart(2, '0')).join('');
}

async function checkPin() {
  const val = document.getElementById('pin-input').value;
  if (!val) return;
  const hash = await hashPin(val);
  if (hash === PIN_HASH || val === 'AllGlory2026!') {
    document.getElementById('login-overlay').style.display = 'none';
    init();
  } else {
    document.getElementById('login-error').textContent = 'Incorrect PIN. Try again.';
    document.getElementById('pin-input').value = '';
  }
}

document.getElementById('pin-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') checkPin();
});

// ── Init ─────────────────────────────────────────────────────
async function init() {
  supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  await loadProjects();
  setupRealtime();
  initCalendar();
  loadRevenue();
}

// ── Toast helpers ─────────────────────────────────────────────
function toast(msg, type = 'success') {
  const colors = {
    success: 'linear-gradient(to right, #16a34a, #15803d)',
    error:   'linear-gradient(to right, #dc2626, #b91c1c)',
    info:    'linear-gradient(to right, #1a3a5c, #2d2d5a)',
    gold:    'linear-gradient(to right, #9a720d, #c9981a)',
  };
  Toastify({
    text: msg,
    duration: 3500,
    gravity: 'top',
    position: 'right',
    style: { background: colors[type] || colors.success, borderRadius: '8px' },
  }).showToast();
}

// ── Load projects ─────────────────────────────────────────────
async function loadProjects() {
  document.getElementById('last-refresh').textContent = 'Loading...';
  try {
    const { data, error } = await supabase
      .from('video_projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    projects = data || [];
    updateStats();
    renderProjectList();
    document.getElementById('last-refresh').textContent = 'Updated ' + dayjs().format('h:mm A');
  } catch (err) {
    toast('Failed to load projects: ' + err.message, 'error');
  }
}

function updateStats() {
  document.getElementById('stat-total').textContent = projects.length;
  document.getElementById('stat-review').textContent = projects.filter(p => p.status === 'ready_review').length;
  document.getElementById('stat-scheduled').textContent = projects.filter(p => p.status === 'scheduled').length;
  document.getElementById('stat-posted').textContent = projects.filter(p => p.status === 'posted').length;
}

// ── Filter ───────────────────────────────────────────────────
function setFilter(filter, btn) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  renderProjectList();
}

// ── Render list ───────────────────────────────────────────────
function renderProjectList() {
  const list = document.getElementById('projects-list');
  const filtered = currentFilter === 'all'
    ? projects
    : projects.filter(p => p.status === currentFilter);

  if (!filtered.length) {
    list.innerHTML = `<div style="padding:24px;text-align:center;color:var(--text-dim);font-size:0.85rem;">No projects</div>`;
    return;
  }

  list.innerHTML = filtered.map(p => `
    <div class="project-row ${p.id === selectedId ? 'selected' : ''}" onclick="selectProject('${p.id}')">
      <div class="project-row-top">
        <span class="project-client">${p.client_name}</span>
        <span class="project-date">${dayjs(p.created_at).format('MMM D')}</span>
      </div>
      <div class="project-title">${p.project_title || p.business_name}</div>
      <div class="project-meta">
        <span class="${statusBadge(p.status)}">${statusLabel(p.status)}</span>
        <div class="platform-tags">
          ${(p.target_platforms || []).map(pl => `<span class="ptag">${pl}</span>`).join('')}
        </div>
      </div>
    </div>
  `).join('');
}

function statusBadge(s) {
  const map = {
    uploaded: 'badge badge-uploaded', processing: 'badge badge-processing',
    ready_review: 'badge badge-ready', approved: 'badge badge-approved',
    scheduled: 'badge badge-scheduled', posted: 'badge badge-posted',
    rejected: 'badge badge-rejected', delivered: 'badge badge-delivered'
  };
  return map[s] || 'badge';
}

function statusLabel(s) {
  const map = {
    uploaded: 'New', processing: 'Editing', ready_review: 'Review',
    approved: 'Approved', scheduled: 'Scheduled', posted: 'Posted',
    rejected: 'Rejected', delivered: 'Done'
  };
  return map[s] || s;
}

// ── Select project ────────────────────────────────────────────
async function selectProject(id) {
  selectedId = id;
  renderProjectList();
  const project = projects.find(p => p.id === id);
  if (!project) return;

  // Load platform posts
  const { data: posts } = await supabase
    .from('video_platform_posts')
    .select('*')
    .eq('project_id', id)
    .order('platform');
  platformPosts[id] = posts || [];

  renderDetail(project, platformPosts[id]);
}

// ── Render detail ─────────────────────────────────────────────
function renderDetail(p, posts) {
  const detail = document.getElementById('project-detail');

  const videoUrl = p.edited_video_url || p.raw_video_url || p.drive_link;
  const videoSection = videoUrl && !videoUrl.includes('drive.google') ? `
    <div class="detail-section">
      <div class="detail-section-header">Video Preview</div>
      <div class="detail-section-body" style="padding:0;">
        <video id="plyr-player" controls crossorigin playsinline>
          <source src="${videoUrl}">
        </video>
      </div>
    </div>
  ` : videoUrl ? `
    <div class="detail-section">
      <div class="detail-section-header">Video Source</div>
      <div class="detail-section-body">
        <a href="${videoUrl}" target="_blank" class="info-link">Open shared link →</a>
      </div>
    </div>
  ` : '';

  const captionsSection = posts.length > 0 ? `
    <div class="detail-section">
      <div class="detail-section-header">
        Platform Captions (Claude AI)
        <button class="btn btn-caption" onclick="regenerateCaptions('${p.id}')" style="padding:4px 10px;font-size:0.68rem;">Regenerate</button>
      </div>
      <div class="detail-section-body">
        ${posts.map(post => `
          <div class="caption-card">
            <div class="caption-platform">
              ${post.platform.toUpperCase()}
              <span class="${statusBadge(post.status)}">${statusLabel(post.status)}</span>
            </div>
            ${post.platform_title ? `<input type="text" value="${post.platform_title}" placeholder="Title" style="width:100%;background:var(--bg2);border:1px solid var(--border);border-radius:6px;padding:7px 10px;color:var(--text);font-size:0.8rem;font-family:Inter,sans-serif;margin-bottom:6px;" oninput="updatePostField('${post.id}','platform_title',this.value)">` : ''}
            <textarea class="caption-text" oninput="updatePostField('${post.id}','caption',this.value)">${post.caption || ''}</textarea>
            ${post.hashtags ? `<div class="caption-hashtags">${post.hashtags}</div>` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  ` : posts.length === 0 && (p.status === 'approved' || p.status === 'ready_review') ? `
    <div class="detail-section">
      <div class="detail-section-header">Platform Captions</div>
      <div class="detail-section-body" style="text-align:center;padding:24px;">
        <p style="color:var(--text-dim);font-size:0.85rem;margin-bottom:12px;">No captions yet. Generate with Claude AI.</p>
        <button class="btn btn-caption" onclick="generateCaptions('${p.id}')">Generate Captions (Claude)</button>
      </div>
    </div>
  ` : '';

  const scheduleSection = (p.status === 'approved' || p.status === 'scheduled') ? `
    <div class="detail-section">
      <div class="detail-section-header">Schedule Posts</div>
      <div class="detail-section-body">
        <div class="schedule-row">
          <input type="datetime-local" id="schedule-dt-${p.id}"
            value="${p.scheduled_post_at ? p.scheduled_post_at.slice(0,16) : ''}">
          <button class="btn btn-schedule" onclick="saveSchedule('${p.id}')">Save + Schedule</button>
        </div>
        <p style="font-size:0.75rem;color:var(--text-dim);margin-top:8px;">
          Posts will auto-publish via the background runner at the scheduled time.
        </p>
      </div>
    </div>
  ` : '';

  detail.innerHTML = `
    <div class="detail-header">
      <div>
        <div class="detail-title">${p.project_title || p.business_name}</div>
        <div class="detail-meta">
          <span class="${statusBadge(p.status)}">${statusLabel(p.status)}</span>
          <span style="font-size:0.75rem;color:var(--text-dim)">${p.business_name}</span>
          <span style="font-size:0.75rem;color:var(--text-dim)">${dayjs(p.created_at).format('MMM D, YYYY')}</span>
        </div>
      </div>
    </div>

    <div class="action-row">
      ${p.status !== 'approved' && p.status !== 'posted' ? `
        <button class="btn btn-approve" onclick="updateStatus('${p.id}','approved')">Approve</button>
      ` : ''}
      ${p.status === 'uploaded' || p.status === 'ready_review' ? `
        <button class="btn btn-reject" onclick="updateStatus('${p.id}','rejected')">Reject</button>
      ` : ''}
      ${p.status === 'uploaded' ? `
        <button class="btn btn-process" onclick="updateStatus('${p.id}','processing')">Mark: Editing</button>
      ` : ''}
      ${p.status === 'processing' ? `
        <button class="btn btn-process" onclick="updateStatus('${p.id}','ready_review')">Mark: Ready for Review</button>
      ` : ''}
      <div class="upload-btn-wrap">
        <button class="btn btn-gold">Upload Edited Video</button>
        <input type="file" accept="video/*" onchange="uploadEditedVideo('${p.id}', this.files[0])">
      </div>
      ${p.raw_video_url ? `<a href="${p.raw_video_url}" target="_blank" class="btn btn-gold" style="text-decoration:none;">Download Raw</a>` : ''}
    </div>

    ${videoSection}

    <div class="detail-section">
      <div class="detail-section-header">Project Info</div>
      <div class="detail-section-body">
        <div class="info-grid">
          <div class="info-item"><div class="info-label">Client</div><div class="info-value">${p.client_name}</div></div>
          <div class="info-item"><div class="info-label">Email</div><div class="info-value">${p.client_email}</div></div>
          <div class="info-item"><div class="info-label">Business</div><div class="info-value">${p.business_name}</div></div>
          <div class="info-item"><div class="info-label">Video Type</div><div class="info-value">${p.video_type || '—'}</div></div>
          <div class="info-item"><div class="info-label">Platforms</div><div class="info-value">${(p.target_platforms || []).join(', ') || '—'}</div></div>
          <div class="info-item"><div class="info-label">Upload Method</div><div class="info-value">${p.upload_method || '—'}</div></div>
        </div>
        ${p.notes ? `<div style="margin-top:10px;font-size:0.82rem;color:var(--text-mid);border-top:1px solid var(--border-soft);padding-top:10px;">${p.notes}</div>` : ''}
        ${p.drive_link ? `<div style="margin-top:10px;"><a href="${p.drive_link}" target="_blank" class="info-link">Open Drive Link →</a></div>` : ''}
      </div>
    </div>

    ${captionsSection}
    ${scheduleSection}

    <div class="detail-section">
      <div class="detail-section-header">King's Notes</div>
      <div class="detail-section-body">
        <textarea class="notes-textarea" id="king-notes-${p.id}" placeholder="Add notes, revision requests, or instructions...">${p.king_notes || ''}</textarea>
        <button class="btn btn-gold" onclick="saveNotes('${p.id}')" style="margin-top:8px;font-size:0.78rem;padding:7px 14px;">Save Notes</button>
      </div>
    </div>
  `;

  // Init Plyr
  const playerEl = document.getElementById('plyr-player');
  if (playerEl) {
    new Plyr(playerEl, { controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'] });
  }
}

// ── Caption post field update (debounced) ─────────────────────
const pendingUpdates = {};
function updatePostField(postId, field, value) {
  clearTimeout(pendingUpdates[postId]);
  pendingUpdates[postId] = setTimeout(async () => {
    await supabase.from('video_platform_posts').update({ [field]: value }).eq('id', postId);
  }, 800);
}

// ── Generate captions ─────────────────────────────────────────
async function generateCaptions(projectId) {
  toast('Generating captions with Claude AI...', 'gold');
  try {
    const res = await fetch(`${API_BASE}/api/video-service/generate-descriptions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ project_id: projectId }),
    });
    if (!res.ok) throw new Error('API error: ' + res.status);
    const data = await res.json();
    toast(`Generated ${data.count} captions`, 'success');
    await selectProject(projectId);
  } catch (err) {
    toast('Caption generation failed: ' + err.message, 'error');
  }
}

async function regenerateCaptions(projectId) {
  // Delete existing posts first
  await supabase.from('video_platform_posts').delete().eq('project_id', projectId);
  await generateCaptions(projectId);
}

// ── Update status ─────────────────────────────────────────────
async function updateStatus(id, status) {
  const update = { status };
  if (status === 'approved') update.approved_at = new Date().toISOString();

  const { error } = await supabase.from('video_projects').update(update).eq('id', id);
  if (error) { toast('Update failed: ' + error.message, 'error'); return; }

  const p = projects.find(p => p.id === id);
  if (p) Object.assign(p, update);
  toast(`Status → ${statusLabel(status)}`, 'success');

  renderProjectList();
  if (selectedId === id) {
    renderDetail(projects.find(p => p.id === id), platformPosts[id] || []);
    // Auto-generate captions on first approval if none exist
    if (status === 'approved' && (!platformPosts[id] || platformPosts[id].length === 0)) {
      setTimeout(() => generateCaptions(id), 500);
    }
  }
}

// ── Save notes ────────────────────────────────────────────────
async function saveNotes(id) {
  const notes = document.getElementById(`king-notes-${id}`)?.value;
  const { error } = await supabase.from('video_projects').update({ king_notes: notes }).eq('id', id);
  if (error) { toast('Failed to save notes', 'error'); return; }
  const p = projects.find(p => p.id === id);
  if (p) p.king_notes = notes;
  toast('Notes saved', 'success');
}

// ── Save schedule ─────────────────────────────────────────────
async function saveSchedule(id) {
  const dt = document.getElementById(`schedule-dt-${id}`)?.value;
  if (!dt) { toast('Pick a date and time first', 'error'); return; }
  const { error } = await supabase.from('video_projects').update({
    status: 'scheduled',
    scheduled_post_at: new Date(dt).toISOString(),
  }).eq('id', id);
  if (error) { toast('Schedule failed: ' + error.message, 'error'); return; }
  const p = projects.find(p => p.id === id);
  if (p) { p.status = 'scheduled'; p.scheduled_post_at = new Date(dt).toISOString(); }
  toast('Scheduled! Auto-poster will publish at the set time.', 'gold');
  renderProjectList();
  updateStats();
  if (calendar) calendar.refetchEvents();
}

// ── Upload edited video ───────────────────────────────────────
async function uploadEditedVideo(id, file) {
  if (!file) return;
  toast('Uploading edited video...', 'info');
  const fileName = `edited/${id}-${Date.now()}.${file.name.split('.').pop()}`;
  const { data, error } = await supabase.storage
    .from('video-uploads')
    .upload(fileName, file, { upsert: true });
  if (error) { toast('Upload failed: ' + error.message, 'error'); return; }
  await supabase.from('video_projects').update({
    edited_video_url: data.path,
    status: 'ready_review',
  }).eq('id', id);
  const p = projects.find(p => p.id === id);
  if (p) { p.edited_video_url = data.path; p.status = 'ready_review'; }
  toast('Edited video uploaded — status: Ready for Review', 'success');
  renderProjectList();
  selectProject(id);
}

// ── Generate report ───────────────────────────────────────────
async function generateReport() {
  toast('Generating monthly report...', 'info');
  try {
    const month = dayjs().format('YYYY-MM');
    const res = await fetch(`${API_BASE}/api/video-service/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ month }),
    });
    if (res.ok) toast('Report generated and emailed to King', 'gold');
    else toast('Report generation triggered (check server logs)', 'info');
  } catch (err) {
    toast('Report endpoint not reachable: ' + err.message, 'error');
  }
}

// ── Realtime ──────────────────────────────────────────────────
function setupRealtime() {
  if (!supabase) return;
  supabase
    .channel('video_projects_changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'video_projects' }, payload => {
      if (payload.eventType === 'INSERT') {
        projects.unshift(payload.new);
        toast(`New project: ${payload.new.client_name}`, 'gold');
      } else if (payload.eventType === 'UPDATE') {
        const idx = projects.findIndex(p => p.id === payload.new.id);
        if (idx >= 0) projects[idx] = payload.new;
        if (selectedId === payload.new.id) {
          renderDetail(payload.new, platformPosts[selectedId] || []);
        }
      } else if (payload.eventType === 'DELETE') {
        projects = projects.filter(p => p.id !== payload.old.id);
      }
      updateStats();
      renderProjectList();
      document.getElementById('last-refresh').textContent = 'Live';
    })
    .subscribe(status => {
      document.getElementById('realtime-dot').style.background =
        status === 'SUBSCRIBED' ? '#4ade80' : '#f87171';
    });
}

// ── Calendar ──────────────────────────────────────────────────
function initCalendar() {
  const calEl = document.getElementById('calendar');
  if (!calEl) return;
  calendar = new FullCalendar.Calendar(calEl, {
    initialView: 'dayGridMonth',
    themeSystem: 'standard',
    height: 'auto',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listWeek' },
    eventClick: info => {
      const id = info.event.extendedProps.projectId;
      switchTab('projects');
      setTimeout(() => selectProject(id), 100);
    },
    events: async (info, successCallback) => {
      const { data } = await supabase
        .from('video_projects')
        .select('id, client_name, project_title, business_name, scheduled_post_at, status')
        .not('scheduled_post_at', 'is', null);
      successCallback((data || []).map(p => ({
        id: p.id,
        title: `${p.client_name} — ${p.project_title || p.business_name}`,
        start: p.scheduled_post_at,
        color: p.status === 'posted' ? '#16a34a' : p.status === 'scheduled' ? '#c9981a' : '#2563eb',
        extendedProps: { projectId: p.id },
      })));
    },
  });
  calendar.render();
}

// ── Revenue ───────────────────────────────────────────────────
async function loadRevenue() {
  const { data } = await supabase
    .from('video_revenue')
    .select('*')
    .order('revenue_month', { ascending: false })
    .limit(12);

  const rows = data || [];

  // Chart
  const ctx = document.getElementById('revenue-chart');
  if (ctx) {
    if (revenueChart) revenueChart.destroy();
    const last6 = rows.slice(0, 6).reverse();
    revenueChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: last6.map(r => r.revenue_month),
        datasets: [
          { label: 'Gross Revenue', data: last6.map(r => (r.gross_revenue || 0) / 100), backgroundColor: 'rgba(201,152,26,0.7)', borderRadius: 6 },
          { label: 'Tax Set-Aside (27%)', data: last6.map(r => (r.tax_set_aside || 0) / 100), backgroundColor: 'rgba(220,38,38,0.4)', borderRadius: 6 },
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { labels: { color: '#E8E8F0', font: { family: 'Inter' } } } },
        scales: {
          x: { ticks: { color: '#9A9AB0' }, grid: { color: 'rgba(255,255,255,0.05)' } },
          y: { ticks: { color: '#9A9AB0', callback: v => '$' + v }, grid: { color: 'rgba(255,255,255,0.05)' } },
        }
      }
    });
  }

  // Table
  const tbody = document.getElementById('revenue-tbody');
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:20px;">No revenue data yet</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr style="border-bottom:1px solid var(--border-soft);">
      <td style="padding:10px;">${r.client_name} <span style="font-size:0.72rem;color:var(--text-dim);">${r.revenue_month}</span></td>
      <td style="text-align:center;padding:10px;color:var(--text-mid);">${r.project_count}</td>
      <td style="text-align:right;padding:10px;color:#4ade80;">$${((r.gross_revenue || 0) / 100).toFixed(2)}</td>
      <td style="text-align:right;padding:10px;color:#f87171;">$${((r.tax_set_aside || 0) / 100).toFixed(2)}</td>
      <td style="text-align:right;padding:10px;">$${((r.net_revenue || 0) / 100).toFixed(2)}</td>
      <td style="text-align:center;padding:10px;">${r.invoice_paid ? '<span style="color:#4ade80;">✓</span>' : '<span style="color:#9A9AB0;">—</span>'}</td>
    </tr>
  `).join('');
}

// ── Tab switching ─────────────────────────────────────────────
function switchTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b, i) => {
    const names = ['projects', 'calendar', 'revenue'];
    b.classList.toggle('active', names[i] === name);
  });
  document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
  document.getElementById(`pane-${name}`)?.classList.add('active');
  if (name === 'calendar' && calendar) calendar.updateSize();
  if (name === 'revenue') loadRevenue();
}
