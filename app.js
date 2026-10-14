// ===== 1. Підключення до Telegram =====
// Якщо сторінку відкрито в Telegram, існує об'єкт Telegram.WebApp.
// У звичайному браузері його немає — тому спочатку перевіряємо.
const tg = window.Telegram && window.Telegram.WebApp;
if (tg) {
  tg.ready();   // повідомляємо Telegram, що сторінка завантажилась
  tg.expand();  // розгортаємо вікно на весь екран
}

// Скорочення: $('temp') замість document.getElementById('temp')
const $ = (id) => document.getElementById(id);
const input = $('city-input');
const suggestions = $('suggestions');
const statusEl = $('status');

// ===== 2. Коди погоди → опис, емодзі, тип фону =====
// Open-Meteo повертає погоду числом (код WMO). Перекладаємо його в текст.
const CODES = {
  0: ['Ясно', '☀️', 'clear'], 1: ['Переважно ясно', '🌤️', 'clear'],
  2: ['Мінлива хмарність', '⛅', 'cloud'], 3: ['Хмарно', '☁️', 'cloud'],
  45: ['Туман', '🌫️', 'fog'], 48: ['Паморозь', '🌫️', 'fog'],
  51: ['Легка мряка', '🌦️', 'rain'], 53: ['Мряка', '🌦️', 'rain'], 55: ['Сильна мряка', '🌧️', 'rain'],
  56: ['Крижана мряка', '🌧️', 'rain'], 57: ['Крижана мряка', '🌧️', 'rain'],
  61: ['Невеликий дощ', '🌦️', 'rain'], 63: ['Дощ', '🌧️', 'rain'], 65: ['Сильний дощ', '🌧️', 'rain'],
  66: ['Крижаний дощ', '🌧️', 'rain'], 67: ['Крижаний дощ', '🌧️', 'rain'],
  71: ['Невеликий сніг', '🌨️', 'snow'], 73: ['Сніг', '❄️', 'snow'], 75: ['Сильний сніг', '❄️', 'snow'],
  77: ['Снігові зерна', '🌨️', 'snow'],
  80: ['Короткочасний дощ', '🌦️', 'rain'], 81: ['Злива', '🌧️', 'rain'], 82: ['Сильна злива', '⛈️', 'rain'],
  85: ['Снігопад', '🌨️', 'snow'], 86: ['Сильний снігопад', '❄️', 'snow'],
  95: ['Гроза', '⛈️', 'storm'], 96: ['Гроза з градом', '⛈️', 'storm'], 99: ['Сильна гроза з градом', '⛈️', 'storm'],
};

function info(code, isDay = 1) {
  const [text, icon, type] = CODES[code] || ['—', '❔', 'cloud'];
  const night = type === 'clear' && !isDay;     // ясна ніч → місяць
  return { text, type, icon: night ? '🌙' : icon };
}

function setStatus(msg) {
  statusEl.textContent = msg;
  statusEl.hidden = !msg;
}

// ===== 3. Пошук міста (геокодинг) =====
// fetch() робить запит в інтернет і повертає "обіцянку" (Promise).
// async/await дозволяє дочекатись відповіді, не блокуючи сторінку.
async function findCities(query) {
  const url = 'https://geocoding-api.open-meteo.com/v1/search' +
    `?name=${encodeURIComponent(query)}&count=5&language=uk&format=json`;
  const res = await fetch(url);
  const data = await res.json();      // перетворюємо відповідь на JS-об'єкт
  return data.results || [];          // якщо нічого не знайшли — порожній масив
}

// Підказки під час набору (з паузою 300 мс, щоб не слати запит на кожну літеру)
let timer;
input.addEventListener('input', () => {
  clearTimeout(timer);
  const q = input.value.trim();
  if (q.length < 2) { suggestions.hidden = true; return; }
  timer = setTimeout(() => showSuggestions(q), 300);
});

async function showSuggestions(q) {
  try {
    const places = await findCities(q);
    suggestions.replaceChildren();
    for (const p of places) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = p.name;                       // textContent безпечний для тексту від користувача
      const small = document.createElement('small');
      small.textContent = [p.admin1, p.country].filter(Boolean).join(', ');
      btn.append(small);
      btn.addEventListener('click', () => selectPlace(p));
      li.append(btn);
      suggestions.append(li);
    }
    suggestions.hidden = places.length === 0;
  } catch (err) {
    suggestions.hidden = true;
  }
}

// Enter у полі пошуку → беремо перший знайдений варіант
$('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();                                  // не перезавантажувати сторінку
  const q = input.value.trim();
  if (!q) return;
  try {
    const places = await findCities(q);
    if (places.length) selectPlace(places[0]);
    else setStatus('Місто не знайдено. Перевірте назву.');
  } catch (err) {
    setStatus('Не вдалося виконати пошук. Спробуйте ще раз.');
  }
});

// Клік поза пошуком закриває підказки
document.addEventListener('click', (e) => {
  if (!e.target.closest('#search-form')) suggestions.hidden = true;
});

function selectPlace(p) {
  suggestions.hidden = true;
  input.value = '';
  input.blur();
  const place = { name: p.name, latitude: p.latitude, longitude: p.longitude };
  try { localStorage.setItem('place', JSON.stringify(place)); } catch (err) {}  // запам'ятовуємо місто
  loadWeather(place);
}

// ===== 4. Завантаження погоди =====
async function loadWeather(place) {
  setStatus('Завантаження…');
  try {
    const url = 'https://api.open-meteo.com/v1/forecast' +
      `?latitude=${place.latitude}&longitude=${place.longitude}` +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day' +
      '&hourly=temperature_2m,weather_code,is_day' +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
      '&timezone=auto&forecast_days=7&wind_speed_unit=ms';
    const res = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    render(place, await res.json());
    setStatus('');
  } catch (err) {
    setStatus('Не вдалося отримати погоду. Перевірте інтернет і спробуйте ще раз.');
  }
}

// ===== 5. Показ даних на сторінці =====
function render(place, d) {
  const c = d.current;
  const now = info(c.weather_code, c.is_day);

  // Фон: змінюємо клас у <body>, CSS підставляє потрібний градієнт
  const sky = now.type === 'clear' ? (c.is_day ? 'clear-day' : 'clear-night') : now.type;
  document.body.className = 'sky-' + sky;

  $('city-name').textContent = place.name;
  $('temp').textContent = Math.round(c.temperature_2m) + '°';
  $('desc').textContent = now.text;
  $('range').textContent =
    `Макс.: ${Math.round(d.daily.temperature_2m_max[0])}°, мін.: ${Math.round(d.daily.temperature_2m_min[0])}°`;
  $('feels').textContent = Math.round(c.apparent_temperature) + '°';
  $('humidity').textContent = Math.round(c.relative_humidity_2m) + '%';
  $('wind').textContent = Math.round(c.wind_speed_10m) + ' м/с';

  // Погодинний прогноз: 24 години, починаючи з поточної
  const h = d.hourly;
  const start = Math.max(0, h.time.findIndex((t) => t.startsWith(c.time.slice(0, 13))));
  let hoursHtml = '';
  for (let i = start; i < start + 24 && i < h.time.length; i++) {
    const label = i === start ? 'Зараз' : h.time[i].slice(11, 16);
    hoursHtml += `<div class="hour"><span>${label}</span>` +
      `<span class="ico">${info(h.weather_code[i], h.is_day[i]).icon}</span>` +
      `<span>${Math.round(h.temperature_2m[i])}°</span></div>`;
  }
  $('hourly').innerHTML = hoursHtml;

  // Прогноз на 7 днів зі смужкою мін–макс
  const dl = d.daily;
  const min = Math.min(...dl.temperature_2m_min);
  const max = Math.max(...dl.temperature_2m_max);
  const span = max - min || 1;
  $('daily').innerHTML = dl.time.map((day, i) => {
    const lo = dl.temperature_2m_min[i];
    const hi = dl.temperature_2m_max[i];
    const name = i === 0 ? 'Сьогодні'
      : new Date(day + 'T12:00:00').toLocaleDateString('uk-UA', { weekday: 'short' });
    const left = ((lo - min) / span) * 100;
    const width = ((hi - lo) / span) * 100;
    return `<li><span>${name}</span><span class="ico">${info(dl.weather_code[i]).icon}</span>` +
      `<span class="lo">${Math.round(lo)}°</span>` +
      `<span class="bar"><i style="margin-left:${left}%;width:${width}%"></i></span>` +
      `<span class="hi">${Math.round(hi)}°</span></li>`;
  }).join('');

  $('weather').hidden = false;
}

// ===== 6. Старт: якщо місто вже вибирали — показуємо його =====
try {
  const saved = localStorage.getItem('place');
  if (saved) loadWeather(JSON.parse(saved));
  else setStatus('Введіть назву міста, щоб побачити погоду.');
} catch (err) {
  setStatus('Введіть назву міста, щоб побачити погоду.');
}
