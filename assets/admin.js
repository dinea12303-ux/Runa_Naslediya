const DB_PATH = 'data/books.json';
const LOCAL_KEY = 'mutationLibraryAdminConfig';
let db = null;
let currentEditingChapterUrl = null;

const ADMIN_CHAPTERS_PER_PAGE = 10;
let adminChaptersPage = 1;

const $ = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function escapeAttr(value) { return escapeHtml(value).replaceAll('`', '&#096;'); }
function encodeBase64Unicode(str) { return btoa(unescape(encodeURIComponent(str))); }
function decodeBase64Unicode(str) { return decodeURIComponent(escape(atob(str.replace(/\n/g, '')))); }
function today() { return new Date().toISOString().slice(0, 10); }
function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'e')
    .replace(/[^a-z0-9_-]+/gi, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
function normalizeBookId(value) { return slugify(value).replace(/_/g, '-'); }
function normalizeChapterId(value, num) { return slugify(value || `chapter-${num || Date.now()}`); }
function setStatus(id, message, type = '') {
  const el = $(id);
  el.textContent = message;
  el.className = `status ${type}`.trim();
}
function getConfig() {
  return {
    owner: $('cfg-owner').value.trim(),
    repo: $('cfg-repo').value.trim(),
    branch: $('cfg-branch').value.trim() || 'main',
    token: $('cfg-token').value.trim()
  };
}
function saveConfig() {
  const cfg = getConfig();
  localStorage.setItem(LOCAL_KEY, JSON.stringify(cfg));
  setStatus('connection-status', '✅ Настройки сохранены в браузере.', 'ok');
}
function loadConfig() {
  const raw = localStorage.getItem(LOCAL_KEY);
  if (!raw) return;
  try {
    const cfg = JSON.parse(raw);
    $('cfg-owner').value = cfg.owner || '';
    $('cfg-repo').value = cfg.repo || '';
    $('cfg-branch').value = cfg.branch || 'main';
    $('cfg-token').value = cfg.token || '';
  } catch {}
}
function requireConfig() {
  const cfg = getConfig();
  if (!cfg.owner || !cfg.repo || !cfg.branch || !cfg.token) {
    throw new Error('Заполни владельца, репозиторий, ветку и токен во вкладке «Подключение».');
  }
  return cfg;
}
function apiUrl(path, cfg = getConfig()) {
  const cleanPath = path.split('/').map(encodeURIComponent).join('/');
  return `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${cleanPath}?ref=${encodeURIComponent(cfg.branch || 'main')}`;
}
function apiHeaders(cfg = getConfig()) {
  return {
    'Authorization': `Bearer ${cfg.token}`,
    'Accept': 'application/vnd.github+json',
    'Content-Type': 'application/json'
  };
}
async function githubGet(path) {
  const cfg = requireConfig();
  const res = await fetch(apiUrl(path, cfg), { headers: apiHeaders(cfg), cache: 'no-store' });
  if (res.status === 404) return null;
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `GitHub не отдал: ${path}`);
  return json;
}
async function githubPut(path, content, message) {
  const cfg = requireConfig();
  const old = await githubGet(path);
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const body = {
    message,
    content: encodeBase64Unicode(content),
    branch: cfg.branch
  };
  if (old?.sha) body.sha = old.sha;
  const res = await fetch(url, { method: 'PUT', headers: apiHeaders(cfg), body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Не удалось сохранить: ${path}`);
  return json;
}
async function githubDelete(path, message) {
  const cfg = requireConfig();
  const old = await githubGet(path);
  if (!old) return;
  const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
  const body = { message, sha: old.sha, branch: cfg.branch };
  const res = await fetch(url, { method: 'DELETE', headers: apiHeaders(cfg), body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || `Не удалось удалить: ${path}`);
}
async function loadDbFromGitHubOrLocal() {
  try {
    const remote = await githubGet(DB_PATH);
    if (!remote) throw new Error('data/books.json не найден в репозитории. Сначала залей стартовые файлы.');
    db = JSON.parse(decodeBase64Unicode(remote.content));
    ensureDbShape();
    fillFormsFromDb();
    renderAllManageLists();
    setStatus('connection-status', '✅ База загружена из GitHub.', 'ok');
  } catch (e) {
    setStatus('connection-status', `⚠️ ${e.message}`, 'warn');
    if (!db) {
      db = { site: {}, theme: {}, books: [] };
      ensureDbShape();
      fillFormsFromDb();
      renderAllManageLists();
    }
  }
}
async function saveDb(message = 'Обновление books.json') {
  ensureDbShape();
  await githubPut(DB_PATH, JSON.stringify(db, null, 2), message);
}
function ensureDbShape() {
  db ||= {};
  db.site ||= {};
  db.theme ||= {};
  db.books ||= [];
}
function fillFormsFromDb() {
  ensureDbShape();
  const site = db.site;
  const theme = db.theme;
  $('site-title').value = site.title || '';
  $('site-subtitle').value = site.subtitle || '';
  $('site-description').value = site.description || '';
  $('site-hero').value = site.heroImageUrl || '';
  $('site-bg').value = site.backgroundImageUrl || '';
  $('theme-background').value = theme.background || '#1e1e26';
  $('theme-surface').value = theme.surface || '#2b2b36';
  $('theme-card').value = theme.card || '#383845';
  $('theme-accent').value = theme.accent || '#d4a5ff';
  $('theme-accent-strong').value = theme.accentStrong || '#7a4bb5';
  $('theme-text').value = theme.text || '#e0e0e0';
  renderBookSelect();
}
function switchPanel(panel) {
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.admin-menu .nav-btn').forEach(b => b.classList.remove('active'));
  $(`panel-${panel}`).classList.add('active');
  document.querySelector(`[data-panel="${panel}"]`).classList.add('active');
}
async function testConnection() {
  try {
    saveConfig();
    const cfg = requireConfig();
    const url = `https://api.github.com/repos/${encodeURIComponent(cfg.owner)}/${encodeURIComponent(cfg.repo)}`;
    const res = await fetch(url, { headers: apiHeaders(cfg), cache: 'no-store' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.message || 'GitHub не принял подключение.');
    await loadDbFromGitHubOrLocal();
    setStatus('connection-status', `✅ Подключено: ${cfg.owner}/${cfg.repo}, ветка ${cfg.branch}`, 'ok');
  } catch (e) {
    setStatus('connection-status', `❌ ${e.message}`, 'bad');
  }
}
async function saveSiteSettings() {
  try {
    ensureDbShape();
    db.site = {
      title: $('site-title').value.trim(),
      subtitle: $('site-subtitle').value.trim(),
      description: $('site-description').value.trim(),
      heroImageUrl: $('site-hero').value.trim(),
      backgroundImageUrl: $('site-bg').value.trim()
    };
    db.theme = {
      background: $('theme-background').value.trim() || '#1e1e26',
      surface: $('theme-surface').value.trim() || '#2b2b36',
      card: $('theme-card').value.trim() || '#383845',
      accent: $('theme-accent').value.trim() || '#d4a5ff',
      accentStrong: $('theme-accent-strong').value.trim() || '#7a4bb5',
      text: $('theme-text').value.trim() || '#e0e0e0',
      muted: db.theme?.muted || '#a9a9b5'
    };
    await saveDb('Обновление главной страницы');
    setStatus('site-status', '✅ Главная страница сохранена.', 'ok');
  } catch (e) { setStatus('site-status', `❌ ${e.message}`, 'bad'); }
}
function clearBookForm() {
  $('book-id').value = '';
  $('book-title').value = '';
  $('book-description').value = '';
  $('book-cover').value = '';
  $('book-icon').value = '';
  setStatus('book-status', '');
}
async function saveBook() {
  try {
    ensureDbShape();
    const id = normalizeBookId($('book-id').value);
    const title = $('book-title').value.trim();
    if (!id || !title) throw new Error('ID и название книги обязательны.');
    let book = db.books.find(b => b.id === id);
    const isNew = !book;
    if (!book) {
      book = { id, chapters: [], createdAt: today() };
      db.books.push(book);
    }
    book.title = title;
    book.description = $('book-description').value.trim();
    book.coverUrl = $('book-cover').value.trim();
    book.iconUrl = $('book-icon').value.trim();
    book.updatedAt = today();
    book.chapters ||= [];
    db.books.sort((a, b) => (a.title || a.id).localeCompare(b.title || b.id, 'ru'));
    await saveDb(`${isNew ? 'Создание' : 'Обновление'} книги ${title}`);
    $('book-id').value = id;
    renderAllManageLists();
    setStatus('book-status', `✅ Книга ${isNew ? 'создана' : 'сохранена'}.`, 'ok');
  } catch (e) { setStatus('book-status', `❌ ${e.message}`, 'bad'); }
}
function editBook(id) {
  const book = db.books.find(b => b.id === id);
  if (!book) return;
  $('book-id').value = book.id;
  $('book-title').value = book.title || '';
  $('book-description').value = book.description || '';
  $('book-cover').value = book.coverUrl || '';
  $('book-icon').value = book.iconUrl || '';
  switchPanel('books');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function deleteBook(id) {
  const book = db.books.find(b => b.id === id);
  if (!book) return;
  if (!confirm(`Удалить книгу полностью?\n\n${book.title}\n\nБудут удалены записи и HTML-файлы глав.`)) return;
  const typed = prompt(`Для подтверждения введи ID книги:\n${book.id}`);
  if (typed !== book.id) return alert('ID введён неверно. Удаление отменено.');
  try {
    for (const ch of book.chapters || []) {
      if (ch.url) await githubDelete(ch.url, `Удаление главы ${ch.title || ch.id}`);
    }
    db.books = db.books.filter(b => b.id !== id);
    await saveDb(`Удаление книги ${book.title}`);
    renderAllManageLists();
    setStatus('book-status', '✅ Книга удалена.', 'ok');
  } catch (e) { setStatus('book-status', `❌ ${e.message}`, 'bad'); }
}
function renderBooksManageList() {
  const box = $('books-manage-list');
  ensureDbShape();
  if (!db.books.length) {
    box.innerHTML = '<p class="empty">Книг пока нет.</p>';
    return;
  }
  box.innerHTML = '';
  for (const book of db.books) {
    const row = document.createElement('div');
    row.className = 'manage-row';
    row.innerHTML = `
      <div><strong>${escapeHtml(book.title || book.id)}</strong><div class="muted small">ID: ${escapeHtml(book.id)} · Глав: ${(book.chapters || []).length}</div></div>
      <div class="row-actions">
        <button class="small-btn" type="button" data-action="edit">Редактировать</button>
        <button class="danger-btn" type="button" data-action="delete">Удалить</button>
      </div>`;
    row.querySelector('[data-action="edit"]').addEventListener('click', () => editBook(book.id));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteBook(book.id));
    box.appendChild(row);
  }
}
function renderBookSelect() {
  const select = $('chapter-book-select');
  const old = select.value;
  select.innerHTML = '';
  for (const book of db.books || []) {
    const opt = document.createElement('option');
    opt.value = book.id;
    opt.textContent = book.title || book.id;
    select.appendChild(opt);
  }
  if ([...select.options].some(o => o.value === old)) select.value = old;
  renderChaptersManageList();
}
function selectedBook() {
  const id = $('chapter-book-select').value;
  return (db.books || []).find(b => b.id === id) || null;
}
function clearChapterForm() {
  currentEditingChapterUrl = null;
  $('chapter-id').value = '';
  $('chapter-num').value = '';
  $('chapter-title').value = '';
  $('chapter-image').value = '';
  $('chapter-text').value = '';
  setStatus('chapter-status', '');
}
function buildChapterUrl(bookId, chapterId) { return `books/${bookId}/${chapterId}.html`; }
function parseChapterText(raw) {
  const blocks = String(raw || '').split(/\n\s*\n/g).map(x => x.trim()).filter(Boolean);
  return blocks.map(block => {
    const img = block.match(/^\[img\](.*?)\[\/img\]$/i);
    if (img) {
      const url = img[1].trim();
      return `<img class="chapter-image" src="${escapeAttr(url)}" alt="Иллюстрация главы">`;
    }
    return `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`;
  }).join('\n');
}
function buildChapterHtml(book, chapter, text) {
  const chapters = [...(book.chapters || [])].sort((a, b) => Number(a.num) - Number(b.num));
  const idx = chapters.findIndex(ch => ch.url === chapter.url);
  const prev = idx > 0 ? chapters[idx - 1] : null;
  const next = idx >= 0 && idx < chapters.length - 1 ? chapters[idx + 1] : null;
  const homeUrl = '../../index.html';
  const bookUrl = `../../index.html?book=${encodeURIComponent(book.id)}`;
  const nav = `
<nav class="chapter-nav">
  ${prev ? `<a href="../../${escapeAttr(prev.url)}">← Предыдущая</a>` : '<span></span>'}
  <a href="${bookUrl}">Оглавление</a>
  <a href="${homeUrl}">Библиотека</a>
  ${next ? `<a href="../../${escapeAttr(next.url)}">Следующая →</a>` : '<span></span>'}
</nav>`;
  const heroImg = chapter.imageUrl ? `<img class="chapter-image" src="${escapeAttr(chapter.imageUrl)}" alt="Иллюстрация главы">` : '';
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Глава ${escapeHtml(chapter.num)}. ${escapeHtml(chapter.title)}</title>
  <link rel="stylesheet" href="../../assets/style.css">
</head>
<body>
  <main class="chapter-page">
    ${nav}
    <h1>Глава ${escapeHtml(chapter.num)}. ${escapeHtml(chapter.title)}</h1>
    ${heroImg}
    <article>
      ${parseChapterText(text)}
    </article>
    ${nav}
  </main>
  <div class="font-controls">
    <button type="button" onclick="changeFont(-1)">−</button>
    <span id="font-label">20px</span>
    <button type="button" onclick="changeFont(1)">+</button>
  </div>
  <script>
    function changeFont(delta) {
      const page = document.querySelector('.chapter-page');
      const current = parseInt(page.style.fontSize || '20', 10);
      const next = Math.min(36, Math.max(14, current + delta));
      page.style.fontSize = next + 'px';
      document.getElementById('font-label').textContent = next + 'px';
      localStorage.setItem('chapterFontSize', String(next));
    }
    const saved = localStorage.getItem('chapterFontSize');
    if (saved) { document.querySelector('.chapter-page').style.fontSize = saved + 'px'; document.getElementById('font-label').textContent = saved + 'px'; }
  <\/script>
</body>
</html>`;
}
async function saveChapter() {
  try {
    const book = selectedBook();
    if (!book) throw new Error('Сначала выбери книгу.');
    const num = $('chapter-num').value.trim();
    const title = $('chapter-title').value.trim();
    const id = normalizeChapterId($('chapter-id').value, num);
    const text = $('chapter-text').value.trim();
    const imageUrl = $('chapter-image').value.trim();
    if (!id || !num || !title || !text) throw new Error('ID, номер, название и текст главы обязательны.');
    book.chapters ||= [];
    let chapter = currentEditingChapterUrl
      ? book.chapters.find(ch => ch.url === currentEditingChapterUrl)
      : book.chapters.find(ch => ch.id === id || ch.url === buildChapterUrl(book.id, id));
    const isNew = !chapter;
    if (!chapter) {
      chapter = { id, createdAt: today() };
      book.chapters.push(chapter);
    }
    const oldUrl = chapter.url;
    chapter.id = id;
    chapter.num = isNaN(Number(num)) ? num : Number(num);
    chapter.title = title;
    chapter.imageUrl = imageUrl;
    chapter.url = buildChapterUrl(book.id, id);
    chapter.updatedAt = today();
    book.updatedAt = today();
    book.chapters.sort((a, b) => Number(a.num) - Number(b.num));
    const html = buildChapterHtml(book, chapter, text);
    await githubPut(chapter.url, html, `${isNew ? 'Создание' : 'Обновление'} главы ${title}`);
    if (oldUrl && oldUrl !== chapter.url) await githubDelete(oldUrl, `Удаление старого файла главы ${title}`);
    await saveDb(`${isNew ? 'Добавление' : 'Обновление'} главы ${title}`);
    currentEditingChapterUrl = chapter.url;
    $('chapter-id').value = id;
    renderAllManageLists();
    setStatus('chapter-status', `✅ Глава ${isNew ? 'создана' : 'сохранена'}.`, 'ok');
  } catch (e) { setStatus('chapter-status', `❌ ${e.message}`, 'bad'); }
}
async function editChapter(bookId, chapterUrl) {
  const book = db.books.find(b => b.id === bookId);
  const chapter = book?.chapters?.find(ch => ch.url === chapterUrl);
  if (!book || !chapter) return;
  $('chapter-book-select').value = bookId;
  $('chapter-id').value = chapter.id || chapter.url.split('/').pop().replace(/\.html$/, '');
  $('chapter-num').value = chapter.num ?? '';
  $('chapter-title').value = chapter.title || '';
  $('chapter-image').value = chapter.imageUrl || '';
  currentEditingChapterUrl = chapter.url;
  setStatus('chapter-status', '⏳ Загружаю текст главы...', 'warn');
  try {
    const file = await githubGet(chapter.url);
    if (!file) throw new Error('Файл главы не найден.');
    const html = decodeBase64Unicode(file.content);
    const article = html.match(/<article>\s*([\s\S]*?)\s*<\/article>/i)?.[1] || '';
    $('chapter-text').value = htmlArticleToEditorText(article);
    setStatus('chapter-status', '✅ Глава загружена для редактирования.', 'ok');
  } catch (e) {
    $('chapter-text').value = '';
    setStatus('chapter-status', `⚠️ Метаданные загружены, но текст не удалось прочитать: ${e.message}`, 'warn');
  }
  switchPanel('chapters');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function htmlArticleToEditorText(html) {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const parts = [];
  doc.body.firstElementChild.childNodes.forEach(node => {
    if (node.nodeType !== 1) return;
    if (node.tagName === 'P') parts.push(node.innerHTML.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim());
    if (node.tagName === 'IMG') parts.push(`[img]${node.getAttribute('src') || ''}[/img]`);
  });
  return parts.filter(Boolean).join('\n\n');
}
async function deleteChapter(bookId, chapterUrl) {
  const book = db.books.find(b => b.id === bookId);
  const chapter = book?.chapters?.find(ch => ch.url === chapterUrl);
  if (!book || !chapter) return;
  if (!confirm(`Удалить главу?\n\nГлава ${chapter.num}. ${chapter.title}`)) return;
  try {
    await githubDelete(chapter.url, `Удаление главы ${chapter.title}`);
    book.chapters = book.chapters.filter(ch => ch.url !== chapterUrl);
    book.updatedAt = today();
    await saveDb(`Удаление главы ${chapter.title}`);
    renderAllManageLists();
    setStatus('chapter-status', '✅ Глава удалена.', 'ok');
  } catch (e) { setStatus('chapter-status', `❌ ${e.message}`, 'bad'); }
}
`function renderChaptersManageList() {
  const box = $('chapters-manage-list');
  const book = selectedBook();

  if (!book) {
    box.innerHTML = '<p class="empty">Сначала создай или выбери книгу.</p>';
    return;
  }

  const chapters = [...(book.chapters || [])].sort((a, b) => Number(a.num) - Number(b.num));

  if (!chapters.length) {
    box.innerHTML = '<p class="empty">В этой книге пока нет глав.</p>';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(chapters.length / ADMIN_CHAPTERS_PER_PAGE));

  if (adminChaptersPage > totalPages) adminChaptersPage = totalPages;
  if (adminChaptersPage < 1) adminChaptersPage = 1;

  const start = (adminChaptersPage - 1) * ADMIN_CHAPTERS_PER_PAGE;
  const end = start + ADMIN_CHAPTERS_PER_PAGE;
  const pageChapters = chapters.slice(start, end);

  box.innerHTML = '';

  for (const ch of pageChapters) {
    const row = document.createElement('div');
    row.className = 'manage-row';
    row.innerHTML = `
      <div>
        <strong>Глава ${escapeHtml(ch.num)}. ${escapeHtml(ch.title || '')}</strong>
        <div class="muted small">${escapeHtml(ch.url || '')}</div>
      </div>
      <div class="row-actions">
        <a class="small-btn" href="${escapeAttr(ch.url)}" target="_blank">Открыть</a>
        <button class="small-btn" type="button" data-action="edit">Редактировать</button>
        <button class="danger-btn" type="button" data-action="delete">Удалить</button>
      </div>`;

    row.querySelector('[data-action="edit"]').addEventListener('click', () => editChapter(book.id, ch.url));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => deleteChapter(book.id, ch.url));

    box.appendChild(row);
  }

  if (totalPages > 1) {
    const pager = document.createElement('div');
    pager.className = 'chapter-pager';
    pager.innerHTML = `
      <button class="small-btn" type="button" data-action="prev" ${adminChaptersPage <= 1 ? 'disabled' : ''}>← Назад</button>
      <span class="muted">Страница ${adminChaptersPage} / ${totalPages}</span>
      <button class="small-btn" type="button" data-action="next" ${adminChaptersPage >= totalPages ? 'disabled' : ''}>Вперёд →</button>
    `;

    pager.querySelector('[data-action="prev"]').addEventListener('click', () => {
      adminChaptersPage--;
      renderChaptersManageList();
    });

    pager.querySelector('[data-action="next"]').addEventListener('click', () => {
      adminChaptersPage++;
      renderChaptersManageList();
    });

    box.appendChild(pager);
  }
}
function renderAllManageLists() {
  renderBookSelect();
  renderBooksManageList();
  renderChaptersManageList();
}
async function checkBrokenLinks() {
  try {
    const broken = [];
    for (const book of db.books || []) {
      for (const ch of book.chapters || []) {
        if (!ch.url) continue;
        const file = await githubGet(ch.url);
        if (!file) broken.push(`${book.title}: глава ${ch.num}. ${ch.title} — ${ch.url}`);
      }
    }
    if (!broken.length) setStatus('service-status', '✅ Битых глав не найдено.', 'ok');
    else setStatus('service-status', `⚠️ Найдены битые записи:\n${broken.join('\n')}`, 'warn');
  } catch (e) { setStatus('service-status', `❌ ${e.message}`, 'bad'); }
}
function downloadDb() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'books.backup.json';
  a.click();
  URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', async () => {
  loadConfig();
  document.querySelectorAll('.admin-menu [data-panel]').forEach(btn => btn.addEventListener('click', () => switchPanel(btn.dataset.panel)));
  $('save-config').addEventListener('click', saveConfig);
  $('test-config').addEventListener('click', testConnection);
  $('clear-token').addEventListener('click', () => { $('cfg-token').value = ''; saveConfig(); setStatus('connection-status', 'Токен удалён из браузера.', 'warn'); });
  $('save-site').addEventListener('click', saveSiteSettings);
  $('save-book').addEventListener('click', saveBook);
  $('clear-book-form').addEventListener('click', clearBookForm);
  $('chapter-book-select').addEventListener('change', () => {
  adminChaptersPage = 1;
  renderChaptersManageList();
});
  $('save-chapter').addEventListener('click', saveChapter);
  $('clear-chapter-form').addEventListener('click', clearChapterForm);
  $('reload-db').addEventListener('click', loadDbFromGitHubOrLocal);
  $('download-db').addEventListener('click', downloadDb);
  $('check-broken').addEventListener('click', checkBrokenLinks);

  if (!$('cfg-branch').value) $('cfg-branch').value = 'main';
  db = { site: {}, theme: {}, books: [] };
  try { await loadDbFromGitHubOrLocal(); } catch { ensureDbShape(); fillFormsFromDb(); renderAllManageLists(); }
});
