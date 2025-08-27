// Client-side UI script for the portfolio site
(function () {
  // Footer year
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  // Initialize Lucide icons when library is available
  function initIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    } else {
      // Retry shortly if script not yet loaded
      setTimeout(initIcons, 50);
    }
  }
  initIcons();

  // Simple hash router: show one [data-page] at a time, default to home
  const pages = Array.from(document.querySelectorAll('[data-page]'));
  const navLinks = Array.from(document.querySelectorAll('[data-route]'));

  function setRoute(hash) {
    const page = (hash || '#/home').replace('#/', '') || 'home';
    pages.forEach(sec => { sec.hidden = sec.getAttribute('data-page') !== page; });
    navLinks.forEach(a => {
      const target = (a.getAttribute('href') || '').replace('#/', '');
      const isActive = target === page;
      a.classList.toggle('text-white', isActive);
      a.classList.toggle('text-white/70', !isActive);
      if (a.classList.contains('px-4')) {
        // Special styling for the first pill link
        a.classList.toggle('bg-white/10', isActive);
      }
    });
    // Rebuild icons in newly-shown section
    initIcons();
  // Track page view
  try { fetch('/api/metrics/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page }) }); } catch {}
  }

  window.addEventListener('hashchange', () => setRoute(location.hash));
  setRoute(location.hash);

  // Login modal controls
  const loginBtn = document.getElementById('open-login');
  const loginModal = document.getElementById('login-modal');
  const closeLogin = document.getElementById('close-login');
  const accountPill = document.getElementById('account-pill');
  const accountName = document.getElementById('account-name');
  const accountAvatar = document.getElementById('account-avatar');
  function showLogin(show) {
    if (!loginModal) return;
    loginModal.classList.toggle('hidden', !show);
    loginModal.classList.toggle('flex', show);
  }
  if (loginBtn) loginBtn.addEventListener('click', () => showLogin(true));
  if (closeLogin) closeLogin.addEventListener('click', () => showLogin(false));
  if (loginModal) loginModal.addEventListener('click', (e) => {
    if (e.target === loginModal) showLogin(false);
  });
  // Auto-open modal if server redirected with ?login=1
  try {
    const params = new URLSearchParams(location.search);
    if (params.get('login') === '1') showLogin(true);
  } catch {}

  // Load projects into grid on the trading page footer section
  const grid = document.getElementById('projects-grid');
  const ghGrid = document.getElementById('github-grid');
  const ghLink = document.getElementById('github-link');
  const ghLinkFooter = document.getElementById('github-link-footer');
  const searchAll = document.getElementById('search-all');
  const repoModal = document.getElementById('repo-modal');
  const closeRepoModal = document.getElementById('close-repo-modal');
  const repoList = document.getElementById('repo-list');
  const repoSearch = document.getElementById('repo-search');
  const meBadge = document.getElementById('me-badge');
  const inlineForm = document.getElementById('inline-form');
  const btnCreate = document.getElementById('create-btn');
  const btnUpdate = document.getElementById('update-btn');
  const btnDelete = document.getElementById('delete-btn');

  let state = { siteProjects: [], ghRepos: [], filter: '' };

  function cardProject(p) {
    return `
      <div class="rounded-3xl p-6 backdrop-blur-xl border border-white/20 hover:border-white/40 transition-all duration-300" style="background: rgba(255,255,255,0.05);">
        <div class="flex items-start justify-between gap-3">
          <div>
            <div class="text-lg font-semibold">${p.name}</div>
            <div class="text-xs text-white/60">${p.type || ''}${p.featured ? ' • Featured' : ''}</div>
          </div>
          <div class="flex items-center gap-2">
            ${p.repoUrl ? `<a class=\"px-3 py-1 text-xs rounded-2xl bg-white/10 hover:bg-white/20\" href=\"${p.repoUrl}\" target=\"_blank\" rel=\"noopener\">Repo</a>` : ''}
            ${p.websiteUrl ? `<a class=\"px-3 py-1 text-xs rounded-2xl bg-white/10 hover:bg-white/20\" href=\"${p.websiteUrl}\" target=\"_blank\" rel=\"noopener\">Open</a>` : ''}
            ${meBadge && !meBadge.classList.contains('hidden') ? `<button data-id="${p.id}" class="edit px-3 py-1 text-xs rounded-2xl bg-white/10 hover:bg-white/20">Edit</button>` : ''}
            ${meBadge && !meBadge.classList.contains('hidden') ? `<button data-id="${p.id}" class="remove px-3 py-1 text-xs rounded-2xl bg-red-600/80">Delete</button>` : ''}
          </div>
        </div>
        ${p.image ? `<img class=\"mt-3 w-full h-40 object-cover rounded-2xl border border-white/10\" src=\"${p.image}\" alt=\"${p.name}\" />` : ''}
        <p class="mt-3 text-white/80 text-sm">${p.description || ''}</p>
        ${Array.isArray(p.tags) && p.tags.length ? `<div class=\"mt-3 flex flex-wrap gap-2\">${p.tags.map(t => `<span class=\"px-2 py-0.5 text-xs rounded-2xl bg-white/10\">${t}</span>`).join('')}</div>` : ''}
      </div>
    `;
  }

  function cardRepo(r) {
    const topics = (r.topics || []).slice(0, 5);
    const lang = r.language ? `<span class=\"text-xs text-white/60\"> • ${r.language}</span>` : '';
    return `
      <a class="rounded-3xl p-6 backdrop-blur-xl border border-white/20 hover:border-white/40 transition-all duration-300 block" style="background: rgba(255,255,255,0.05);" href="${r.html_url}" target="_blank" rel="noopener">
        <div class="flex items-center justify-between mb-1">
          <div class="text-lg font-semibold truncate">${r.name}</div>
          <div class="text-xs text-white/60">★ ${r.stargazers_count || 0}</div>
        </div>
        <div class="text-sm text-white/70 line-clamp-2">${r.description || ''}</div>
        <div class="mt-2 text-xs text-white/60">${r.private ? 'Private' : 'Public'}${lang}</div>
        ${topics.length ? `<div class=\"mt-3 flex flex-wrap gap-2\">${topics.map(t => `<span class=\"px-2 py-0.5 text-xs rounded-2xl bg-white/10\">${t}</span>`).join('')}</div>` : ''}
      </a>
    `;
  }

  function render() {
    if (grid) {
      const q = state.filter;
      const items = state.siteProjects.filter(p => {
        const hay = [p.name, p.description, p.type, ...(p.tags||[])].join(' ').toLowerCase();
        return !q || hay.includes(q);
      });
      grid.innerHTML = items.map(cardProject).join('') || `<div class="text-white/70">No matching site projects.</div>`;
    }
    if (ghGrid) {
      const q = state.filter;
      const items = state.ghRepos.filter(r => {
        const hay = [r.name, r.description, r.language, ...(r.topics||[])].join(' ').toLowerCase();
        return !q || hay.includes(q);
      });
      ghGrid.innerHTML = items.map(cardRepo).join('') || `<div class="text-white/70">No matching GitHub repositories.</div>`;
    }
    initIcons();
  }

  async function loadSiteProjects() {
    try {
      const res = await fetch('/api/projects');
      state.siteProjects = await res.json();
    } catch (e) {
      state.siteProjects = [];
    }
  }

  async function loadMe() {
    try {
      const res = await fetch('/api/me');
      const me = await res.json();
      const authed = me && me.authed;
      if (authed) {
        if (meBadge) { meBadge.classList.remove('hidden'); meBadge.classList.add('flex'); }
        if (inlineForm) { inlineForm.classList.remove('hidden'); }
        if (accountPill) {
          accountPill.classList.remove('hidden');
          if (loginBtn) loginBtn.classList.add('hidden');
          if (accountName) accountName.textContent = (me.user && (me.user.username || me.user.name)) || 'Account';
          if (accountAvatar && me.user && me.user.avatar) accountAvatar.src = me.user.avatar;
        }
      }
      return authed;
    } catch { return false; }
  }

  // loadGitHub implemented later with profile + stats

  // Debounced search
  if (searchAll) {
    let t;
    searchAll.addEventListener('input', () => {
      clearTimeout(t);
      t = setTimeout(() => { state.filter = searchAll.value.trim().toLowerCase(); render(); }, 150);
    });
  }

  // Inline editor handlers
  function formToPayload(form) {
    const fd = new FormData(form);
    const payload = Object.fromEntries(fd.entries());
    payload.featured = !!fd.get('featured');
    return payload;
  }

  if (btnCreate && inlineForm) {
    btnCreate.addEventListener('click', async (e) => {
      e.preventDefault();
      const payload = formToPayload(inlineForm);
      await fetch('/api/projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      inlineForm.reset();
      await loadSiteProjects();
      render();
    });
  }
  if (btnUpdate && inlineForm) {
    btnUpdate.addEventListener('click', async () => {
      const fd = new FormData(inlineForm);
      const id = (fd.get('id') || '').toString().trim();
      if (!id) return alert('Provide an ID to update');
      const payload = formToPayload(inlineForm);
      await fetch('/api/projects/' + encodeURIComponent(id), { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      await loadSiteProjects();
      render();
    });
  }
  if (btnDelete && inlineForm) {
    btnDelete.addEventListener('click', async () => {
      const fd = new FormData(inlineForm);
      const id = (fd.get('id') || '').toString().trim();
      if (!id) return alert('Provide an ID to delete');
      if (!confirm('Delete project ' + id + '?')) return;
      await fetch('/api/projects/' + encodeURIComponent(id), { method: 'DELETE' });
      await loadSiteProjects();
      render();
    });
  }

  // Delegate edit/delete buttons on cards
  if (grid) {
    grid.addEventListener('click', async (e) => {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      if (t.matches('button.edit')) {
        const id = t.getAttribute('data-id');
        const p = state.siteProjects.find(x => x.id === id);
        if (!p || !inlineForm) return;
        // populate form
        inlineForm.querySelector('[name="id"]').value = p.id || '';
        inlineForm.querySelector('[name="name"]').value = p.name || '';
        inlineForm.querySelector('[name="repoUrl"]').value = p.repoUrl || '';
        inlineForm.querySelector('[name="websiteUrl"]').value = p.websiteUrl || '';
        inlineForm.querySelector('[name="tags"]').value = (p.tags||[]).join(', ');
        inlineForm.querySelector('[name="type"]').value = p.type || 'other';
        inlineForm.querySelector('[name="status"]').value = p.status || 'active';
        inlineForm.querySelector('[name="image"]').value = p.image || '';
        inlineForm.querySelector('[name="description"]').value = p.description || '';
        const feat = inlineForm.querySelector('[name="featured"]');
        if (feat) feat.checked = !!p.featured;
        inlineForm.scrollIntoView({ behavior: 'smooth' });
      } else if (t.matches('button.remove')) {
        const id = t.getAttribute('data-id');
        if (!id) return;
        if (!confirm('Delete project ' + id + '?')) return;
        await fetch('/api/projects/' + encodeURIComponent(id), { method: 'DELETE' });
        await loadSiteProjects();
        render();
      }
    });
  }

  // Charts using Chart.js from CDN
  const charts = {};
  function ensureChartJs(cb) {
    if (window.Chart) return cb();
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    s.onload = () => cb();
    document.head.appendChild(s);
  }

  async function buildCharts() {
    const langEl = document.getElementById('lang-chart');
    const starEl = document.getElementById('stars-chart');
    const cmtEl = document.getElementById('commits-chart');
    const pagesEl = document.getElementById('pages-chart');
    if (!langEl || !starEl || !cmtEl) return;

    // Languages distribution from ghRepos
    const byLang = {};
    state.ghRepos.forEach(r => { if (r.language) byLang[r.language] = (byLang[r.language]||0)+1; });
    const langLabels = Object.keys(byLang);
    const langData = Object.values(byLang);

    charts.lang && charts.lang.destroy();
    const lctx = langEl.getContext('2d');
    const lg = lctx.createLinearGradient(0,0,0,160);
    lg.addColorStop(0, 'rgba(255,255,255,0.85)');
    lg.addColorStop(1, 'rgba(255,255,255,0.15)');
    charts.lang = new Chart(lctx, {
      type: 'doughnut',
      data: { labels: langLabels, datasets: [{ data: langData, backgroundColor: langLabels.map((_,i)=>`hsla(${(i*57)%360},70%,55%,0.7)`), borderColor: '#9ca3af', borderWidth: 1 }]},
      options: { plugins: { legend: { labels: { color: '#fff' } }, tooltip: { backgroundColor: 'rgba(0,0,0,0.6)' } }, layout: { padding: 8 } }
    });

    // Stars per repo (top 10)
    const top = [...state.ghRepos].sort((a,b)=> (b.stargazers_count||0)-(a.stargazers_count||0)).slice(0,10);
    charts.stars && charts.stars.destroy();
    const sctx = starEl.getContext('2d');
    const sg = sctx.createLinearGradient(0,0,0,160);
    sg.addColorStop(0, 'rgba(99,102,241,0.6)');
    sg.addColorStop(1, 'rgba(99,102,241,0.05)');
    charts.stars = new Chart(sctx, {
      type: 'bar',
      data: { labels: top.map(r=>r.name), datasets: [{ label: 'Stars', data: top.map(r=>r.stargazers_count||0), backgroundColor: sg, borderRadius: 8 }]},
      options: { scales: { x: { ticks: { color: '#ccc' }, grid: { color: 'rgba(255,255,255,0.08)' } }, y: { ticks: { color: '#ccc' }, grid: { color: 'rgba(255,255,255,0.08)' } } }, plugins: { legend: { labels: { color: '#fff' } }, tooltip: { backgroundColor: 'rgba(0,0,0,0.6)' } } }
    });

    // Simple commits trend (approx via updated_at)
    const days = Array.from({length: 13}, (_,i)=> i*7).reverse(); // 12 weeks buckets
    const now = Date.now();
    const buckets = new Array(days.length-1).fill(0);
    state.ghRepos.forEach(r => {
      const t = new Date(r.pushed_at || r.updated_at || r.created_at || 0).getTime();
      for (let i=0;i<days.length-1;i++) {
        const from = now - days[i+1]*24*3600*1000;
        const to = now - days[i]*24*3600*1000;
        if (t >= from && t < to) { buckets[i]++; break; }
      }
    });
    charts.cmts && charts.cmts.destroy();
    const cctx = cmtEl.getContext('2d');
    const g1 = cctx.createLinearGradient(0,0,0,160);
    g1.addColorStop(0, 'rgba(99,102,241,0.4)');
    g1.addColorStop(1, 'rgba(99,102,241,0.05)');
    const g2 = cctx.createLinearGradient(0,0,0,160);
    g2.addColorStop(0, 'rgba(168,85,247,0.4)');
    g2.addColorStop(1, 'rgba(168,85,247,0.05)');
    charts.cmts = new Chart(cctx, {
      type: 'line',
      data: { labels: buckets.map((_,i)=>`W${i+1}`), datasets: [{ label: 'Repo activity', data: buckets, borderColor: 'rgba(168,85,247,0.9)', backgroundColor: g2, fill: true, tension: 0.35 }]},
      options: { scales: { x: { ticks: { color: '#ccc' }, grid: { color: 'rgba(255,255,255,0.08)' } }, y: { ticks: { color: '#ccc' }, grid: { color: 'rgba(255,255,255,0.08)' } } }, plugins: { legend: { labels: { color: '#fff' } }, tooltip: { backgroundColor: 'rgba(0,0,0,0.6)' } } }
    });

    // Replace commits chart with traffic trend (views & uniques)
    try {
      const res = await fetch('/api/metrics/summary?days=60');
      const m = await res.json();
      const ctx = cmtEl.getContext('2d');
      charts.cmts && charts.cmts.destroy();
      charts.cmts = new Chart(ctx, {
        type: 'line',
        data: {
          labels: m.labels,
          datasets: [
            { label: 'Views', data: m.views, borderColor: 'rgba(99,102,241,0.9)', backgroundColor: g1, fill: true, tension: 0.35 },
            { label: 'Uniques', data: m.uniques, borderColor: 'rgba(168,85,247,0.9)', backgroundColor: g2, fill: true, tension: 0.35 }
          ]
        },
        options: { scales: { x: { ticks: { color: '#ccc' }, grid: { color: 'rgba(255,255,255,0.08)' } }, y: { ticks: { color: '#ccc' }, grid: { color: 'rgba(255,255,255,0.08)' } } }, plugins: { legend: { labels: { color: '#fff' } } } }
      });

      // Top Pages chart
      if (pagesEl) {
        const pctx = pagesEl.getContext('2d');
        charts.pages && charts.pages.destroy();
        charts.pages = new Chart(pctx, {
          type: 'bar',
          data: { labels: (m.pages||[]).map(x=>x[0]), datasets: [{ label: 'Views', data: (m.pages||[]).map(x=>x[1]), backgroundColor: 'rgba(255,255,255,0.35)', borderRadius: 8 }]},
          options: { scales: { x: { ticks: { color: '#ccc' }, grid: { display: false } }, y: { ticks: { color: '#ccc' }, grid: { color: 'rgba(255,255,255,0.08)' } } }, plugins: { legend: { labels: { color: '#fff' } } } }
        });
      }
    } catch {}
  }

  async function loadGitHub() {
    try {
      const meta = document.querySelector('meta[name="github:user"]');
      const user = (meta && meta.content) ? meta.content : '';
      if (!user) return;
      const profileUrl = `https://github.com/${user}?tab=repositories`;
      if (ghLink) ghLink.href = profileUrl;
      if (ghLinkFooter) ghLinkFooter.href = profileUrl;
      const [reposRes, userRes] = await Promise.all([
        fetch(`https://api.github.com/users/${encodeURIComponent(user)}/repos?per_page=100&sort=updated`),
        fetch(`https://api.github.com/users/${encodeURIComponent(user)}`)
      ]);
      const data = await reposRes.json();
      const profile = await userRes.json();
      state.ghRepos = (Array.isArray(data) ? data : []).filter(r => !r.fork).slice(0, 50);
      // Build stats cards
      buildStats(profile);
    } catch (e) {
      state.ghRepos = [];
    }
  }

  function buildStats(profile) {
    const el = document.getElementById('stats-cards');
    if (!el) return;
    const repoCount = Array.isArray(state.ghRepos) ? state.ghRepos.length : 0;
    const stars = state.ghRepos.reduce((s,r)=> s + (r.stargazers_count||0), 0);
    const forks = state.ghRepos.reduce((s,r)=> s + (r.forks_count||0), 0);
    const followers = profile && profile.followers || 0;
    const items = [
      { label: 'Repos', value: repoCount, icon: 'folder' },
      { label: 'Stars', value: stars, icon: 'star' },
      { label: 'Forks', value: forks, icon: 'git-fork' },
      { label: 'Followers', value: followers, icon: 'users' }
    ];
    el.innerHTML = items.map(({label,value,icon})=> `
      <div class="rounded-3xl p-5 backdrop-blur-2xl border border-white/15" style="background: rgba(255,255,255,0.06); box-shadow: inset 0 1px 0 rgba(255,255,255,0.2), 0 18px 48px rgba(255,255,255,0.08)">
        <div class="flex items-center justify-between">
          <div>
            <div class="text-2xl font-semibold">${value}</div>
            <div class="text-white/60 text-sm">${label}</div>
          </div>
          <div class="w-10 h-10 rounded-2xl bg-white/10 grid place-items-center">
            <i data-lucide="${icon}" class="w-5 h-5"></i>
          </div>
        </div>
      </div>
    `).join('');
    initIcons();
  }

  function renderAll() { render(); ensureChartJs(buildCharts); }

  // Initial load
  Promise.all([loadMe(), loadSiteProjects(), loadGitHub()]).then(renderAll);
  // Initial view track
  try { fetch('/api/metrics/view', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ page: 'home' }) }); } catch {}

  // Repo modal interactions
  function showRepoModal(show) {
    if (!repoModal) return;
    repoModal.classList.toggle('hidden', !show);
    repoModal.classList.toggle('flex', show);
  }
  if (closeRepoModal) closeRepoModal.addEventListener('click', () => showRepoModal(false));
  if (repoModal) repoModal.addEventListener('click', (e) => { if (e.target === repoModal) showRepoModal(false); });
  if (repoSearch) repoSearch.addEventListener('input', () => renderRepoList());
  function renderRepoList() {
    if (!repoList) return;
    const q = (repoSearch && repoSearch.value || '').trim().toLowerCase();
    const items = state.ghRepos.filter(r => !q || (r.name + ' ' + (r.description||'')).toLowerCase().includes(q));
    repoList.innerHTML = items.map(r => `
      <a class="rounded-2xl p-4 border border-white/15 bg-white/5 hover:bg-white/10 transition" href="${r.html_url}" target="_blank" rel="noopener">
        <div class="flex items-center justify-between">
          <div class="font-medium truncate mr-2">${r.name}</div>
          <div class="text-xs text-white/60">★ ${r.stargazers_count||0}</div>
        </div>
        <div class="text-sm text-white/70 line-clamp-2 mt-1">${r.description||''}</div>
      </a>
    `).join('');
  }
  // Open repo modal on stars chart click
  document.addEventListener('click', (e) => {
    const t = e.target;
    if (t && t.id === 'stars-chart') {
      showRepoModal(true);
      renderRepoList();
    }
  });
})();
