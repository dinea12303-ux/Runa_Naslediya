const DATA_URL = 'data/books.json';
const CHAPTERS_PER_PAGE = 10;

let libraryDb = null;
let currentBook = null;
let currentPage = 1;
let chapterFilter = '';

function applyGlobalReaderTheme() {
  try {
    const raw = localStorage.getItem('readerSettingsV1');
    const settings = raw ? JSON.parse(raw) : {};
    const theme = settings.theme || 'dark';

    document.body.classList.remove(
      'reader-theme-dark',
      'reader-theme-gray',
      'reader-theme-soft',
      'reader-theme-paper',
      'reader-theme-white'
    );

    document.body.classList.add('reader-theme-' + theme);
  } catch (e) {
    document.body.classList.add('reader-theme-dark');
  }
}

applyGlobalReaderTheme();

window.addEventListener('storage', (event) => {
  if (event.key === 'readerSettingsV1') {
    applyGlobalReaderTheme();
  }
});

const $ = (id) => document.getElementById(id);

function safeText(value) {
  return String(value ?? '');
}

async function loadDb() {
  const res = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить data/books.json');
  libraryDb = await res.json();
  applySiteSettings();
  renderBooks();
}

function applySiteSettings() {
  const site = libraryDb.site || {};
  const theme = libraryDb.theme || {};

  document.title = site.title || 'Библиотека';
  $('site-title-mini').textContent = site.title || 'Библиотека';
  $('site-title').textContent = site.title || 'Библиотека';
  $('site-subtitle').textContent = site.subtitle || '';
  $('site-description').textContent = site.description || '';

  const root = document.documentElement;
  if (theme.background) root.style.setProperty('--bg', theme.background);
  if (theme.surface) root.style.setProperty('--surface', theme.surface);
  if (theme.card) root.style.setProperty('--card', theme.card);
  if (theme.accent) root.style.setProperty('--accent', theme.accent);
  if (theme.accentStrong) root.style.setProperty('--accent-strong', theme.accentStrong);
  if (theme.text) root.style.setProperty('--text', theme.text);
  if (theme.muted) root.style.setProperty('--muted', theme.muted);

const hero = $('hero');
hero.classList.remove('has-image');
hero.style.backgroundImage = '';

  if (site.backgroundImageUrl) {
    document.body.classList.add('has-bg');
document.body.style.backgroundImage = `url("${site.backgroundImageUrl.replace(/"/g, "%27")}")`;  }
}

function showLibrary() {
  currentBook = null;
  $('library-view').classList.add('active');
  $('book-view').classList.remove('active');
  window.history.replaceState(null, '', 'index.html');
  renderBooks();
}

function showBook(bookId) {
  const book = (libraryDb.books || []).find(b => b.id === bookId);
  if (!book) return showLibrary();

  currentBook = book;
  currentPage = 1;
  chapterFilter = '';
  $('chapter-search').value = '';

  $('library-view').classList.remove('active');
  $('book-view').classList.add('active');
  $('book-title').textContent = book.title || book.id;
  $('book-description').textContent = book.description || '';
  $('book-count').textContent = `Глав: ${(book.chapters || []).length}`;

  const cover = $('book-cover');
  if (book.coverUrl) {
    cover.src = book.coverUrl;
    cover.classList.remove('hidden');
  } else {
    cover.classList.add('hidden');
  }

  const icon = $('book-icon');
  if (book.iconUrl) {
    icon.src = book.iconUrl;
    icon.classList.remove('hidden');
  } else {
    icon.classList.add('hidden');
  }

  window.history.replaceState(null, '', `index.html?book=${encodeURIComponent(book.id)}`);
  renderChapters();
}


function getLastReadChapter(bookId) {
  try {
    const raw = localStorage.getItem('lastReadChapterV1');
    if (!raw) return null;

    const data = JSON.parse(raw);
    if (!data || data.bookId !== bookId || !data.chapterUrl) return null;

    return data;
  } catch (e) {
    return null;
  }
}

function saveLastReadChapter(book, chapter) {
  try {
    localStorage.setItem('lastReadChapterV1', JSON.stringify({
      bookId: book.id,
      bookTitle: book.title || book.id,
      chapterUrl: chapter.url,
      chapterNum: chapter.num,
      chapterTitle: chapter.title || '',
      savedAt: Date.now()
    }));
  } catch (e) {}
}

function renderBooks() {
  const grid = $('books-grid');
  const empty = $('empty-library');
  const q = ($('book-search')?.value || '').toLowerCase().trim();
  const books = (libraryDb.books || []).filter(book => {
    const hay = `${book.title || ''} ${book.description || ''} ${book.id || ''}`.toLowerCase();
    return !q || hay.includes(q);
  });

  grid.innerHTML = '';
  empty.classList.toggle('hidden', books.length > 0);

  for (const book of books) {
    const card = document.createElement('article');
    card.className = 'book-card';

    const coverHtml = book.coverUrl
      ? `<img class="book-cover" src="${escapeAttr(book.coverUrl)}" alt="Обложка ${escapeAttr(book.title)}">`
      : `<div class="book-cover placeholder">📘</div>`;

    const iconHtml = book.iconUrl
      ? `<img class="book-icon" src="${escapeAttr(book.iconUrl)}" alt="Иконка">`
      : `<span class="book-icon" style="display:inline-flex;align-items:center;justify-content:center;background:rgba(212,165,255,.12);">✦</span>`;

    card.innerHTML = `
      ${coverHtml}
      <div class="book-card-body">
        <div class="book-card-title">${iconHtml}<span>${escapeHtml(book.title || book.id)}</span></div>
        <div class="book-card-desc">${escapeHtml(book.description || 'Описание пока не добавлено.')}</div>
        <div class="muted small">Глав: ${(book.chapters || []).length}</div>
        <button class="primary-btn" type="button">Открыть</button>
      </div>
    `;
    card.querySelector('button').addEventListener('click', () => showBook(book.id));
    grid.appendChild(card);
  }
}

function renderChapters() {
  if (!currentBook) return;
  const list = $('chapters-list');
  const chapters = [...(currentBook.chapters || [])].sort((a, b) => Number(a.num) - Number(b.num));
  const q = chapterFilter.toLowerCase().trim();
  const filtered = chapters.filter(ch => {
    const hay = `глава ${ch.num} ${ch.title || ''} ${ch.id || ''}`.toLowerCase();
    return !q || hay.includes(q);
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / CHAPTERS_PER_PAGE));
  currentPage = Math.min(Math.max(currentPage, 1), totalPages);
  const pageItems = filtered.slice((currentPage - 1) * CHAPTERS_PER_PAGE, currentPage * CHAPTERS_PER_PAGE);

  list.innerHTML = '';
  if (!pageItems.length) {
    list.innerHTML = '<p class="empty">Главы не найдены.</p>';
  }

  for (const ch of pageItems) {
    const a = document.createElement('a');
    a.href = ch.url;
    a.className = 'chapter-row';
    a.innerHTML = `
      <div>
        <div class="chapter-title">Глава ${escapeHtml(ch.num)}. ${escapeHtml(ch.title || '')}</div>
        ${ch.imageUrl ? '<div class="chapter-meta">Есть иллюстрация</div>' : ''}
      </div>
      <span class="chapter-meta">Открыть →</span>
    `;
    list.appendChild(a);
  }

  $('pagination').classList.toggle('hidden', filtered.length <= CHAPTERS_PER_PAGE);
  $('page-info').textContent = `Стр. ${currentPage} / ${totalPages}`;
  $('prev-page').disabled = currentPage <= 1;
  $('next-page').disabled = currentPage >= totalPages;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll('`', '&#096;');
}

document.addEventListener('DOMContentLoaded', async () => {
  $('home-button').addEventListener('click', showLibrary);
  $('back-to-library').addEventListener('click', showLibrary);
  $('book-search').addEventListener('input', renderBooks);
  $('chapter-search').addEventListener('input', (e) => {
    chapterFilter = e.target.value;
    currentPage = 1;
    renderChapters();
  });
  $('prev-page').addEventListener('click', () => { currentPage--; renderChapters(); });
  $('next-page').addEventListener('click', () => { currentPage++; renderChapters(); });

  try {
    await loadDb();
    const params = new URLSearchParams(location.search);
    const bookId = params.get('book');
    if (bookId) showBook(bookId);
  } catch (e) {
    $('books-grid').innerHTML = `<p class="empty">Ошибка загрузки базы: ${escapeHtml(e.message)}</p>`;
  }
});
function addTopReadLink() {
  const header = document.querySelector('header') || document.querySelector('.topbar') || document.querySelector('.site-header');
  if (!header) return;

  if (document.querySelector('.top-read-link')) return;

  const link = document.createElement('a');
  link.className = 'top-read-link';
  link.href = 'index.html?book=runa-naslediya';
  link.textContent = 'Читать «Руна Наследия»';

  header.appendChild(link);
}

addTopReadLink();