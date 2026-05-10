const DATA_URL = 'data/books.json';
const CHAPTERS_PER_PAGE = 10;

let libraryDb = null;
let currentBook = null;
let currentPage = 1;
let chapterFilter = '';

const $ = (id) => document.getElementById(id);

// 1. Функция применения темы
function applyGlobalReaderTheme() {
  try {
    const raw = localStorage.getItem('readerSettingsV1');
    const settings = raw ? JSON.parse(raw) : {};
    const theme = settings.theme || 'dark';
    document.body.classList.remove('reader-theme-dark', 'reader-theme-gray', 'reader-theme-soft', 'reader-theme-paper', 'reader-theme-white');
    document.body.classList.add('reader-theme-' + theme);
  } catch (e) {
    document.body.classList.add('reader-theme-dark');
  }
}

applyGlobalReaderTheme();

// 2. Загрузка базы данных
async function loadDb() {
  const res = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Не удалось загрузить data/books.json');
  libraryDb = await res.json();
  applySiteSettings();
  renderBooks();
  setupCustomCards(); // Оживляем красивые карточки
}

// 3. Оживляем те самые карточки, которые не кликались
function setupCustomCards() {
  // Ищем блоки, где написано "Глобальная" и "Руна Наследия"
  const cards = document.querySelectorAll('.hero-overlay .book-card-mini, .hero-overlay > div'); 
  
  cards.forEach(card => {
    const text = card.innerText.toLowerCase();
    if (text.includes('глобальная')) {
      card.style.cursor = 'pointer';
      card.onclick = () => showBook('3');
    } else if (text.includes('руна наследия')) {
      card.style.cursor = 'pointer';
      card.onclick = () => showBook('runa-naslediya');
    }
  });
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

  if (site.backgroundImageUrl) {
    document.body.classList.add('has-bg');
    document.body.style.backgroundImage = `url("${site.backgroundImageUrl.replace(/"/g, "%27")}")`;
  }
}

function showLibrary() {
  currentBook = null;
  $('library-view').classList.add('active');
  $('book-view').classList.remove('active');
  window.history.replaceState(null, '', 'index.html');
  renderBooks();
}

function showBook(bookId) {
  const book = (libraryDb.books || []).find(b => String(b.id) === String(bookId));
  if (!book) return;

  currentBook = book;
  currentPage = 1;
  chapterFilter = '';
  if ($('chapter-search')) $('chapter-search').value = '';

  $('library-view').classList.remove('active');
  $('book-view').classList.add('active');
  $('book-title').textContent = book.title || book.id;
  $('book-description').textContent = book.description || '';
  $('book-count').textContent = `Глав: ${(book.chapters || []).length}`;

  const cover = $('book-cover');
  if (book.coverUrl) { cover.src = book.coverUrl; cover.classList.remove('hidden'); } 
  else { cover.classList.add('hidden'); }

  const icon = $('book-icon');
  if (book.iconUrl) { icon.src = book.iconUrl; icon.classList.remove('hidden'); } 
  else { icon.classList.add('hidden'); }

  window.scrollTo(0, 0);
  renderChapters();
}

function renderBooks() {
  const grid = $('books-grid');
  if (!grid) return;
  const books = libraryDb.books || [];
  grid.innerHTML = '';

  for (const book of books) {
    const card = document.createElement('article');
    card.className = 'book-card';
    card.innerHTML = `
      <div class="book-card-body">
        <div class="book-card-title"><span>${escapeHtml(book.title)}</span></div>
        <div class="muted small">Глав: ${(book.chapters || []).length}</div>
        <button class="primary-btn" type="button">Открыть</button>
      </div>
    `;
    card.querySelector('button').onclick = () => showBook(book.id);
    grid.appendChild(card);
  }
}

function renderChapters() {
  if (!currentBook) return;
  const list = $('chapters-list');
  // Сортировка глав по номеру, чтобы 33 была после 24, а не в начале
  const chapters = [...(currentBook.chapters || [])].sort((a, b) => Number(a.num) - Number(b.num));
  
  const totalPages = Math.max(1, Math.ceil(chapters.length / CHAPTERS_PER_PAGE));
  const pageItems = chapters.slice((currentPage - 1) * CHAPTERS_PER_PAGE, currentPage * CHAPTERS_PER_PAGE);

  list.innerHTML = '';
  for (const ch of pageItems) {
    const a = document.createElement('a');
    a.href = ch.url;
    a.className = 'chapter-row';
    a.innerHTML = `<div><div class="chapter-title">Глава ${ch.num}. ${escapeHtml(ch.title || '')}</div></div><span>Открыть →</span>`;
    list.appendChild(a);
  }
  
  $('pagination').classList.toggle('hidden', chapters.length <= CHAPTERS_PER_PAGE);
  $('page-info').textContent = `Стр. ${currentPage} / ${totalPages}`;
}

function escapeHtml(v) { return String(v||'').replace(/&/g, '&amp;').replace(/</g, '&lt;'); }

document.addEventListener('DOMContentLoaded', () => {
  loadDb();
  $('home-button').onclick = showLibrary;
  $('back-to-library').onclick = showLibrary;
  $('prev-page').onclick = () => { currentPage--; renderChapters(); };
  $('next-page').onclick = () => { currentPage++; renderChapters(); };
});
