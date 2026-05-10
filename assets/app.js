const DATA_URL = 'data/books.json';
const CHAPTERS_PER_PAGE = 10;

let libraryDb = null;
let currentBook = null;
let currentPage = 1;

const $ = (id) => document.getElementById(id);

// Загрузка базы
async function loadDb() {
  try {
    const res = await fetch(`${DATA_URL}?v=${Date.now()}`, { cache: 'no-store' });
    libraryDb = await res.json();
    applySiteSettings();
    renderBooks();
    setupHeroCards(); // Оживляем карточки на главном экране
  } catch (e) {
    console.error("Ошибка загрузки БД:", e);
  }
}

// Функция для поиска карточек на главном экране (которые на скриншоте)
function setupHeroCards() {
  // Ищем все блоки, которые могут быть карточками
  const allDivs = document.querySelectorAll('div, article, section');
  
  allDivs.forEach(el => {
    const text = el.innerText || "";
    // Проверяем, есть ли внутри текст названия книги и при этом это не огромный весь экран
    if (el.children.length < 10) { 
      if (text.includes('Глобальная игра') || text.includes('Глобальная')) {
        makeClickable(el, '3');
      } else if (text.includes('Руна Наследия')) {
        makeClickable(el, 'runa-naslediya');
      }
    }
  });
}

function makeClickable(el, bookId) {
  el.style.cursor = 'pointer';
  el.onclick = (e) => {
    e.preventDefault();
    showBook(bookId);
  };
}

function applySiteSettings() {
  const site = libraryDb.site || {};
  $('site-title').textContent = site.title || 'Библиотека';
  $('site-subtitle').textContent = site.subtitle || '';
  $('site-description').textContent = site.description || '';

  if (site.backgroundImageUrl) {
    document.body.style.backgroundImage = `url("${site.backgroundImageUrl}")`;
    document.body.classList.add('has-bg');
  }
}

function showBook(bookId) {
  const book = (libraryDb.books || []).find(b => String(b.id) === String(bookId));
  if (!book) return;

  currentBook = book;
  currentPage = 1;

  $('library-view').classList.remove('active');
  $('book-view').classList.add('active');
  
  // Заполняем данные
  $('book-title').textContent = book.title;
  $('book-description').textContent = book.description || 'Описание отсутствует';
  $('book-count').textContent = `Всего глав: ${book.chapters.length}`;

  const cover = $('book-cover');
  if (book.coverUrl) { cover.src = book.coverUrl; cover.classList.remove('hidden'); }
  else { cover.classList.add('hidden'); }

  window.scrollTo(0, 0);
  renderChapters();
}

function renderBooks() {
  const grid = $('books-grid');
  if (!grid) return;
  grid.innerHTML = '';

  (libraryDb.books || []).forEach(book => {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.innerHTML = `
      <div class="book-card-body">
        <h4>${book.title}</h4>
        <button class="primary-btn">Читать</button>
      </div>
    `;
    card.onclick = () => showBook(book.id);
    grid.appendChild(card);
  });
}

function renderChapters() {
  if (!currentBook) return;
  const list = $('chapters-list');
  const chapters = [...currentBook.chapters].sort((a, b) => Number(a.num) - Number(b.num));
  
  const totalPages = Math.ceil(chapters.length / CHAPTERS_PER_PAGE);
  const items = chapters.slice((currentPage - 1) * CHAPTERS_PER_PAGE, currentPage * CHAPTERS_PER_PAGE);

  list.innerHTML = '';
  items.forEach(ch => {
    const a = document.createElement('a');
    a.href = ch.url;
    a.className = 'chapter-row';
    a.innerHTML = `<div>Глава ${ch.num}: ${ch.title || ''}</div><span>→</span>`;
    list.appendChild(a);
  });

  $('pagination').classList.toggle('hidden', chapters.length <= CHAPTERS_PER_PAGE);
  $('page-info').textContent = `${currentPage} / ${totalPages}`;
}

// При нажатии на логотип или "Назад"
function showLibrary() {
  currentBook = null;
  $('book-view').classList.remove('active');
  $('library-view').classList.add('active');
}

document.addEventListener('DOMContentLoaded', () => {
  loadDb();
  if ($('home-button')) $('home-button').onclick = showLibrary;
  if ($('back-to-library')) $('back-to-library').onclick = showLibrary;
  if ($('prev-page')) $('prev-page').onclick = () => { if(currentPage > 1) { currentPage--; renderChapters(); } };
  if ($('next-page')) $('next-page').onclick = () => { currentPage++; renderChapters(); };
});
