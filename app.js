'use strict';

// Grafik zmian – wersja webowa (PWA). Dane w localStorage, w tym samym formacie co grafik.json z Windowsa.
const VERSION = '1.1.0';
const KEY = 'grafik-data';

// (kolor osoby, tło chipa, tekst chipa) – te same co w aplikacji na Windows
const PALETTE = [
  ['#F0B44C', '#3A2F17', '#F6CD82'],
  ['#5CC8B8', '#173532', '#8FE0D3'],
  ['#8FB3FF', '#1C2A45', '#B5CCFF'],
  ['#F28CB8', '#3E1E2D', '#F8B7D3'],
  ['#9ED46A', '#24331A', '#C3E79E'],
  ['#B9A3FF', '#2B2445', '#D3C6FF'],
];
const DOW = ['nd', 'pon', 'wt', 'śr', 'czw', 'pt', 'sob'];
const $ = (id) => document.getElementById(id);

// ---------- Daty i czas (klucze "RRRR-MM-DD", bez stref czasowych) ----------
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const dateOf = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const todayKey = () => keyOf(new Date());
const addDays = (k, n) => { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); };
const shiftKey = (s) => String(s.Date).slice(0, 10);
const inMonth = (k, m) => k.slice(0, 7) === m.slice(0, 7);

function normTime(t) {
  if (typeof t !== 'string') return null;
  let s = t.trim().replace('.', ':');
  if (/^\d{1,2}$/.test(s)) s += ':00';
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(s);
  if (!m) return null;
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return null;
  return pad(h) + ':' + pad(mi);
}
const minutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hoursOf = (s) => { const d = minutes(s.End) - minutes(s.Start); return d > 0 ? d / 60 : 0; };
const short = (t) => { const [h, m] = t.split(':').map(Number); return m ? h + ':' + pad(m) : String(h); };
const nf = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
const fmtH = (h) => nf.format(h) + ' h';
const money = (x, digits = 2) => new Intl.NumberFormat('pl-PL', { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(x) + ' zł';
const longDay = (k) => dateOf(k).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
const shortDay = (k) => { const d = dateOf(k); return DOW[d.getDay()] + ' ' + pad(d.getDate()) + '.' + pad(d.getMonth() + 1); };
function monthTitle(m) {
  const name = new Intl.DateTimeFormat('pl-PL', { month: 'long' }).format(dateOf(m));
  return name.charAt(0).toUpperCase() + name.slice(1) + ' ' + m.slice(0, 4);
}

// ---------- Dane ----------
function normalize(d) {
  d = d && typeof d === 'object' ? d : {};
  const cleanShifts = (arr) => {
    const byDay = new Map();
    (Array.isArray(arr) ? arr : []).forEach((s) => {
      if (!s || typeof s.Date !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(s.Date)) return;
      const k = shiftKey(s);
      byDay.set(k, { Date: k + 'T00:00:00', Start: normTime(s.Start) || '08:00', End: normTime(s.End) || '16:00' });
    });
    return [...byDay.values()].sort((a, b) => a.Date.localeCompare(b.Date));
  };
  let people = (Array.isArray(d.People) ? d.People : []).filter((p) => p && typeof p === 'object').map((p) => ({
    Name: (typeof p.Name === 'string' && p.Name.trim()) || 'Osoba',
    Rate: Number(p.Rate) > 0 && isFinite(Number(p.Rate)) ? Number(p.Rate) : 0,
    Shifts: cleanShifts(p.Shifts),
  }));
  if (!people.length) {
    // stary format z jedną osobą albo pusty start
    people.push({ Name: 'Ja', Rate: Number(d.Rate) > 0 ? Number(d.Rate) : 0, Shifts: cleanShifts(d.Shifts) });
  }
  const sel = Number.isInteger(d.Selected) && d.Selected >= 0 && d.Selected < people.length ? d.Selected : 0;
  return {
    People: people,
    Selected: sel,
    View: d.View === 'kalendarz' ? 'kalendarz' : 'lista',
    ShowAllInCalendar: d.ShowAllInCalendar !== false,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* uszkodzony zapis – start od nowa */ }
  return normalize(null);
}

let data = load();
let month = todayKey().slice(0, 8) + '01';
let selDay = todayKey();
let lastTimes = ['08:00', '16:00'];

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    const d = new Date();
    $('status').textContent = 'Zapisano o ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ' · dane są tylko na tym urządzeniu';
  } catch (e) {
    $('status').textContent = 'Nie zapisano: ' + e.message;
  }
}

const cur = () => data.People[data.Selected];
const shiftOn = (p, k) => p.Shifts.find((s) => shiftKey(s) === k);
const colorOf = (i) => PALETTE[i % PALETTE.length];

// ---------- Rysowanie ----------
function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach((c) => c != null && e.append(c));
  return e;
}

function render() {
  document.documentElement.style.setProperty('--accent', colorOf(data.Selected)[0]);
  $('nameText').textContent = cur().Name;
  $('monthText').textContent = monthTitle(month);
  const cal = data.View === 'kalendarz';
  $('viewList').setAttribute('aria-pressed', String(!cal));
  $('viewCal').setAttribute('aria-pressed', String(cal));
  $('listView').hidden = cal;
  $('calView').hidden = !cal;
  $('showAllWrap').hidden = !cal || data.People.length < 2;
  $('showAll').checked = data.ShowAllInCalendar;
  renderPeople();
  renderStats();
  if (cal) renderCalendar(); else renderList();
}

function renderPeople() {
  const box = $('people');
  box.replaceChildren();
  data.People.forEach((p, i) => {
    const h = p.Shifts.filter((s) => inMonth(shiftKey(s), month)).reduce((a, s) => a + hoursOf(s), 0);
    box.append(el('button', {
      class: 'person' + (i === data.Selected ? ' sel' : ''), type: 'button',
      'aria-pressed': String(i === data.Selected),
      onclick: () => { if (i !== data.Selected) { data.Selected = i; save(); render(); } },
    },
    el('span', { class: 'avatar', style: 'background:' + colorOf(i)[0], 'aria-hidden': 'true' }, p.Name.charAt(0).toUpperCase()),
    el('span', { class: 'pn' }, p.Name),
    el('span', { class: 'ph' }, fmtH(h))));
  });
  box.append(el('button', { class: 'person add', type: 'button', onclick: addPerson }, '+ Dodaj osobę'));
}

function renderStats() {
  const p = cur();
  const list = p.Shifts.filter((s) => inMonth(shiftKey(s), month));
  const total = list.reduce((a, s) => a + hoursOf(s), 0);
  $('statHours').textContent = nf.format(total);
  $('statCount').textContent = String(list.length);
  $('statAvg').textContent = list.length ? fmtH(total / list.length) : '–';
  $('statEarnLbl').textContent = p.Rate > 0 ? 'Zarobek · ' + nf.format(p.Rate) + ' zł/h' : 'Zarobek (ustaw stawkę)';
  $('statEarn').textContent = p.Rate > 0 ? money(total * p.Rate, 0) : '–';
}

function renderList() {
  const body = $('listBody');
  body.replaceChildren();
  const list = cur().Shifts.filter((s) => inMonth(shiftKey(s), month));
  if (!list.length) {
    body.append(el('div', { class: 'empty' }, 'Brak zmian w tym miesiącu.', el('br'), 'Stuknij + aby dodać pierwszą.'));
    return;
  }
  const today = todayKey();
  list.forEach((s) => {
    const k = shiftKey(s);
    body.append(el('button', {
      class: 'row' + (k > today ? ' future' : ''), type: 'button',
      'aria-label': longDay(k) + ', ' + s.Start + ' do ' + s.End,
      onclick: () => openShift(k),
    },
    el('span', {}, shortDay(k)),
    el('span', { class: 't' }, s.Start + ' – ' + s.End),
    el('span', { class: 'h' }, fmtH(hoursOf(s)))));
  });
}

function renderCalendar() {
  const grid = $('calGrid');
  grid.replaceChildren();
  const first = dateOf(month);
  const offset = (first.getDay() + 6) % 7; // poniedziałek = 0
  let k = addDays(month, -offset);
  const today = todayKey();
  const narrow = window.matchMedia('(max-width: 899px)').matches;
  const maxChips = narrow ? 2 : 3;
  for (let i = 0; i < 42; i++) {
    const day = k;
    const chips = [];
    data.People.forEach((p, pi) => {
      if (!data.ShowAllInCalendar && pi !== data.Selected) return;
      const s = shiftOn(p, day);
      if (!s) return;
      const c = colorOf(pi);
      chips.push(el('span', {
        class: 'chip', title: p.Name + ': ' + s.Start + '–' + s.End,
        style: 'background:' + c[1] + ';color:' + c[2] + ';box-shadow:inset 3px 0 0 ' + c[0],
      }, short(s.Start) + '–' + short(s.End)));
    });
    const shown = chips.slice(0, maxChips);
    if (chips.length > maxChips) shown.push(el('span', { class: 'more' }, '+' + (chips.length - maxChips)));
    const cls = ['day'];
    if (!inMonth(day, month)) cls.push('out');
    if (i % 7 >= 5) cls.push('we');
    if (day === today) cls.push('today');
    if (day === selDay) cls.push('sel');
    grid.append(el('button', {
      class: cls.join(' '), type: 'button', 'aria-label': longDay(day) + (chips.length ? ', ' + chips.length + ' zm.' : ''),
      onclick: () => { selDay = day; if (!inMonth(day, month)) month = day.slice(0, 8) + '01'; render(); openShift(day); },
    }, el('span', { class: 'n' }, String(dateOf(day).getDate())), shown));
    k = addDays(k, 1);
  }
}

// ---------- Nawigacja ----------
function showMonth(delta) {
  const d = dateOf(month);
  d.setMonth(d.getMonth() + delta);
  month = keyOf(d);
  const sd = dateOf(selDay);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  selDay = keyOf(new Date(d.getFullYear(), d.getMonth(), Math.min(sd.getDate(), last)));
  render();
}
$('prevMonth').onclick = () => showMonth(-1);
$('nextMonth').onclick = () => showMonth(1);
$('todayBtn').onclick = () => { selDay = todayKey(); month = selDay.slice(0, 8) + '01'; render(); };
$('viewList').onclick = () => { data.View = 'lista'; save(); render(); };
$('viewCal').onclick = () => { data.View = 'kalendarz'; save(); render(); };
$('showAll').onchange = (e) => { data.ShowAllInCalendar = e.target.checked; save(); render(); };
$('fab').onclick = () => openShift(inMonth(selDay, month) ? selDay : todayKey());

// przesuwanie palcem po kalendarzu/liście zmienia miesiąc
(() => {
  let x0 = null, y0 = null;
  const area = document.querySelector('.content');
  area.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  area.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.5) showMonth(dx < 0 ? 1 : -1);
    x0 = null;
  }, { passive: true });
})();

// ---------- Okna ----------
document.querySelectorAll('dialog').forEach((d) => {
  d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => d.close()));
  // stuknięcie w tło zamyka okno
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
});

// --- Zmiana ---
function fillShiftForm(k) {
  const p = cur();
  const s = shiftOn(p, k);
  $('shiftTitle').textContent = s ? 'Edytuj zmianę' : 'Dodaj zmianę';
  const others = data.People.map((q, i) => (i === data.Selected ? null : (shiftOn(q, k) ? q.Name + ': ' + shiftOn(q, k).Start + '–' + shiftOn(q, k).End : null))).filter(Boolean);
  $('shiftInfo').textContent = p.Name + ' · ' + longDay(k) + (others.length ? '\n' + others.join(' · ') : '');
  $('shiftInfo').style.whiteSpace = 'pre-line';
  $('fStart').value = s ? s.Start : lastTimes[0];
  $('fEnd').value = s ? s.End : lastTimes[1];
  $('fDelete').hidden = !s;
  $('fMsg').textContent = '';
  updateLength();
}

function openShift(k) {
  selDay = k;
  $('fDate').value = k;
  fillShiftForm(k);
  $('shiftDlg').showModal();
}

function updateLength() {
  const a = normTime($('fStart').value), b = normTime($('fEnd').value);
  const s = shiftOn(cur(), $('fDate').value);
  let label = s ? 'Zapisz zmiany' : 'Dodaj zmianę';
  presetsHighlight(a, b);
  if (!a || !b) { $('fLength').textContent = 'Wpisz godziny, np. 8:00'; $('fSave').textContent = label; return; }
  const h = (minutes(b) - minutes(a)) / 60;
  if (h <= 0) { $('fLength').textContent = 'Koniec musi być później niż początek'; $('fSave').textContent = label; return; }
  const r = cur().Rate;
  $('fLength').textContent = 'Długość zmiany: ' + fmtH(h) + (r > 0 ? ' · ' + money(h * r) : '');
  $('fSave').textContent = label + ' · ' + fmtH(h);
}

function presetsHighlight(a, b) {
  document.querySelectorAll('[data-preset]').forEach((btn) => {
    const [s, e] = btn.dataset.preset.split('|');
    btn.classList.toggle('on', s === a && e === b);
  });
}

document.querySelectorAll('[data-preset]').forEach((btn) => btn.addEventListener('click', () => {
  const [s, e] = btn.dataset.preset.split('|');
  $('fStart').value = s;
  $('fEnd').value = e;
  updateLength();
}));
$('fStart').addEventListener('input', updateLength);
$('fEnd').addEventListener('input', updateLength);
$('fDate').addEventListener('change', () => {
  const k = $('fDate').value;
  if (/^\d{4}-\d{2}-\d{2}$/.test(k)) fillShiftForm(k);
});

$('shiftForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const k = $('fDate').value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) { $('fMsg').textContent = 'Wybierz datę.'; return; }
  const a = normTime($('fStart').value), b = normTime($('fEnd').value);
  if (!a || !b) { $('fMsg').textContent = 'Wpisz godziny w formacie 8:00.'; return; }
  if (minutes(b) <= minutes(a)) { $('fMsg').textContent = 'Koniec zmiany musi być później niż początek.'; return; }
  const p = cur();
  p.Shifts = p.Shifts.filter((s) => shiftKey(s) !== k);
  p.Shifts.push({ Date: k + 'T00:00:00', Start: a, End: b });
  p.Shifts.sort((x, y) => x.Date.localeCompare(y.Date));
  lastTimes = [a, b];
  selDay = k;
  if (!inMonth(k, month)) month = k.slice(0, 8) + '01';
  save();
  $('shiftDlg').close();
  render();
});

$('fDelete').addEventListener('click', () => {
  const k = $('fDate').value;
  if (!confirm('Usunąć zmianę osoby „' + cur().Name + '” z dnia ' + longDay(k) + '?')) return;
  cur().Shifts = cur().Shifts.filter((s) => shiftKey(s) !== k);
  save();
  $('shiftDlg').close();
  render();
});

// --- Osoba ---
function openPerson() {
  const p = cur();
  $('personTitle').textContent = 'Osoba';
  $('pName').value = p.Name;
  $('pRate').value = p.Rate > 0 ? nf.format(p.Rate) : '';
  $('pMsg').textContent = '';
  $('pDelete').hidden = data.People.length <= 1;
  $('personDlg').showModal();
}
function addPerson() {
  data.People.push({ Name: 'Osoba ' + (data.People.length + 1), Rate: 0, Shifts: [] });
  data.Selected = data.People.length - 1;
  save();
  render();
  openPerson();
  setTimeout(() => { $('pName').focus(); $('pName').select(); }, 50);
}
$('personBtn').onclick = openPerson;
$('earnTile').onclick = () => { openPerson(); setTimeout(() => $('pRate').focus(), 50); };

$('personForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = $('pName').value.trim();
  if (!name) { $('pMsg').textContent = 'Wpisz nazwę osoby.'; return; }
  const rt = $('pRate').value.trim().replace(/\s/g, '').replace(',', '.');
  const rate = rt === '' ? 0 : Number(rt);
  if (!isFinite(rate) || rate < 0) { $('pMsg').textContent = 'Wpisz poprawną stawkę, np. 32,50.'; return; }
  cur().Name = name;
  cur().Rate = rate;
  save();
  $('personDlg').close();
  render();
});

$('pDelete').addEventListener('click', () => {
  if (data.People.length <= 1) return;
  if (!confirm('Usunąć osobę „' + cur().Name + '” razem ze wszystkimi jej zmianami?')) return;
  data.People.splice(data.Selected, 1);
  data.Selected = Math.min(data.Selected, data.People.length - 1);
  save();
  $('personDlg').close();
  render();
});

// --- Wyślij grafik (obrazek PNG + tekst do WhatsApp / Messenger) ---
const share = { all: false, earn: false, file: null, url: null, text: '', seq: 0 };

function zmianWord(n) {
  const d = n % 10, dd = n % 100;
  if (n === 1) return 'zmiana';
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? 'zmiany' : 'zmian';
}

// Sekcje dokumentu: osoba + jej zmiany w pokazywanym miesiącu
function shareSections() {
  const people = share.all ? data.People.map((p, i) => [p, i]) : [[cur(), data.Selected]];
  return people.map(([p, i]) => {
    const list = p.Shifts.filter((s) => inMonth(shiftKey(s), month));
    const total = list.reduce((a, s) => a + hoursOf(s), 0);
    return { p, color: colorOf(i)[0], list, total };
  }).filter((sec) => !share.all || sec.list.length);
}

function summaryLine(sec) {
  let t = 'Razem: ' + fmtH(sec.total) + ' · ' + sec.list.length + ' ' + zmianWord(sec.list.length);
  if (share.earn && sec.p.Rate > 0) t += ' · ' + money(sec.total * sec.p.Rate);
  return t;
}

function buildShareText() {
  const secs = shareSections();
  const lines = ['📅 Grafik pracy – ' + monthTitle(month)];
  if (!secs.length) lines.push('', 'Brak zmian w tym miesiącu.');
  secs.forEach((sec) => {
    lines.push('', '👤 ' + sec.p.Name);
    if (!sec.list.length) lines.push('Brak zmian w tym miesiącu.');
    sec.list.forEach((s) => lines.push(shortDay(shiftKey(s)) + '  ' + s.Start + '–' + s.End + '  (' + fmtH(hoursOf(s)) + ')'));
    if (sec.list.length) lines.push(summaryLine(sec));
  });
  if (secs.length > 1) lines.push('', 'Łącznie: ' + fmtH(secs.reduce((a, x) => a + x.total, 0)));
  return lines.join('\n');
}

// Rysuje dokument; z ctx = null tylko liczy wysokość
function paintShare(ctx, W) {
  const F = '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif';
  const P = 64, INK = '#18222B', MUTED = '#5D6B76', LINE = '#E3E8EC', ZEBRA = '#F5F7F8';
  const colTime = P + 330, colEnd = W - P;
  const secs = shareSections();
  let y = 0;
  const text = (t, x, yy, font, color, align = 'left', maxW) => {
    if (!ctx) return;
    ctx.font = font; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
    if (maxW && ctx.measureText(t).width > maxW) {
      while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
      t += '…';
    }
    ctx.fillText(t, x, yy);
  };
  const rect = (x, yy, w, h, color) => { if (ctx) { ctx.fillStyle = color; ctx.fillRect(x, yy, w, h); } };

  rect(0, 0, W, 14, secs.length === 1 ? secs[0].color : '#0D6B63');
  y = 14 + P + 46;
  text('Grafik pracy', P, y, '700 56px ' + F, INK);
  y += 52;
  text(monthTitle(month), P, y, '400 34px ' + F, MUTED);
  y += 40;

  if (!secs.length) {
    y += 70;
    text('Brak zmian w tym miesiącu.', P, y, '400 32px ' + F, MUTED);
    y += 30;
  }

  secs.forEach((sec) => {
    y += 44;
    rect(P, y - 4, W - 2 * P, 2, LINE);
    y += 62;
    if (ctx) { ctx.fillStyle = sec.color; ctx.beginPath(); ctx.arc(P + 14, y - 12, 14, 0, Math.PI * 2); ctx.fill(); }
    text(sec.p.Name, P + 44, y, '700 38px ' + F, INK, 'left', W - 2 * P - 260);
    text(fmtH(sec.total), colEnd, y, '700 38px ' + F, INK, 'right');
    y += 30;
    if (!sec.list.length) {
      y += 50;
      text('Brak zmian w tym miesiącu.', P, y, '400 30px ' + F, MUTED);
      return;
    }
    y += 40;
    text('DZIEŃ', P + 20, y, '600 22px ' + F, MUTED);
    text('GODZINY', colTime, y, '600 22px ' + F, MUTED);
    text('CZAS', colEnd - 20, y, '600 22px ' + F, MUTED, 'right');
    y += 16;
    sec.list.forEach((s, i) => {
      const k = shiftKey(s);
      if (i % 2 === 0) rect(P, y, W - 2 * P, 64, ZEBRA);
      const base = y + 43;
      const d = dateOf(k);
      text(DOW[d.getDay()], P + 20, base, '600 31px ' + F, INK);
      text(pad(d.getDate()) + '.' + pad(d.getMonth() + 1), P + 110, base, '400 31px ' + F, INK);
      text(s.Start + ' – ' + s.End, colTime, base, '400 31px ' + F, INK);
      text(fmtH(hoursOf(s)), colEnd - 20, base, '600 31px ' + F, INK, 'right');
      y += 64;
    });
    y += 48;
    text(summaryLine(sec), P + 20, y, '600 28px ' + F, MUTED);
  });

  if (secs.length > 1) {
    y += 40;
    rect(P, y, W - 2 * P, 2, LINE);
    y += 60;
    text('Łącznie', P, y, '700 36px ' + F, INK);
    text(fmtH(secs.reduce((a, x) => a + x.total, 0)), colEnd, y, '700 36px ' + F, INK, 'right');
  }
  y += 70;
  const now = new Date();
  text('Grafik · ' + pad(now.getDate()) + '.' + pad(now.getMonth() + 1) + '.' + now.getFullYear(), P, y, '400 22px ' + F, '#8E9AA3');
  return y + P;
}

function shareFileName() {
  const who = share.all ? 'wszyscy' : cur().Name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'osoba';
  return 'grafik-' + month.slice(0, 7) + '-' + who + '.png';
}

// Plik jest gotowy z wyprzedzeniem: iPhone pozwala otworzyć menu Udostępnij tylko od razu po stuknięciu.
function prepareShare() {
  const seq = ++share.seq;
  share.text = buildShareText();
  share.file = null;
  $('shareImg').disabled = true;
  const W = 1080;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = Math.ceil(paintShare(null, W));
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, c.width, c.height);
  paintShare(ctx, W);
  c.toBlob((blob) => {
    if (seq !== share.seq || !blob) return;
    share.file = new File([blob], shareFileName(), { type: 'image/png' });
    if (share.url) URL.revokeObjectURL(share.url);
    share.url = URL.createObjectURL(blob);
    $('sharePreview').src = share.url;
    $('shareImg').disabled = false;
  }, 'image/png');
}

function renderShareDlg() {
  const many = data.People.length > 1;
  $('shareWhoWrap').hidden = !many;
  if (!many) share.all = false;
  $('shareOne').textContent = cur().Name;
  $('shareOne').setAttribute('aria-pressed', String(!share.all));
  $('shareAll').setAttribute('aria-pressed', String(share.all));
  const anyRate = (share.all ? data.People : [cur()]).some((p) => p.Rate > 0);
  $('shareEarn').parentElement.hidden = !anyRate;
  $('shareEarn').checked = share.earn;
  $('shareInfo').textContent = 'Godziny pracy za ' + monthTitle(month).toLowerCase() + '. Inny miesiąc wybierzesz strzałkami w nagłówku.';
  const canFiles = !!(navigator.canShare && navigator.canShare({ files: [new File([''], 'a.png', { type: 'image/png' })] }));
  $('shareImg').textContent = canFiles ? 'Udostępnij obrazek' : 'Pobierz obrazek';
  $('shareText').hidden = !navigator.share;
  $('shareMsg').textContent = '';
  prepareShare();
}

function shareNote(t) { $('shareMsg').textContent = t; }

$('shareBtn').onclick = () => { renderShareDlg(); $('shareDlg').showModal(); };
$('shareOne').onclick = () => { share.all = false; renderShareDlg(); };
$('shareAll').onclick = () => { share.all = true; renderShareDlg(); };
$('shareEarn').onchange = (e) => { share.earn = e.target.checked; renderShareDlg(); };

$('shareImg').onclick = () => {
  const f = share.file;
  if (!f) return;
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    navigator.share({ files: [f], title: 'Grafik pracy – ' + monthTitle(month) }).catch((e) => {
      if (e.name !== 'AbortError') shareNote('Nie udało się udostępnić: ' + e.message);
    });
    return;
  }
  const a = el('a', { href: share.url, download: f.name });
  document.body.append(a);
  a.click();
  a.remove();
  shareNote('Zapisano obrazek ' + f.name + ' – dołącz go w WhatsAppie lub Messengerze.');
};

$('shareText').onclick = () => {
  navigator.share({ text: share.text }).catch((e) => {
    if (e.name !== 'AbortError') shareNote('Nie udało się udostępnić: ' + e.message);
  });
};

$('shareWa').onclick = () => {
  window.open('https://wa.me/?text=' + encodeURIComponent(share.text), '_blank');
};

$('shareCopy').onclick = async () => {
  try {
    await navigator.clipboard.writeText(share.text);
    shareNote('Skopiowano – wklej w Messengerze lub WhatsAppie.');
  } catch (e) {
    shareNote('Nie udało się skopiować tekstu.');
  }
};

// --- Menu: eksport / import ---
$('menuBtn').onclick = () => { $('versionText').textContent = 'Wersja ' + VERSION; $('menuDlg').showModal(); };

$('exportBtn').onclick = async () => {
  const json = JSON.stringify(data, null, 2);
  const file = new File([json], 'grafik.json', { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'Grafik – dane' }); return; }
    catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = el('a', { href: URL.createObjectURL(file), download: 'grafik.json' });
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
};

$('importBtn').onclick = () => $('importFile').click();
$('importFile').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const parsed = JSON.parse(await f.text());
    const next = normalize(parsed);
    const n = next.People.reduce((a, p) => a + p.Shifts.length, 0);
    if (!confirm('Zastąpić obecne dane danymi z pliku?\n(' + next.People.length + ' os., ' + n + ' zmian)')) return;
    data = next;
    save();
    $('menuDlg').close();
    render();
  } catch (err) {
    alert('Nie udało się wczytać pliku: ' + err.message);
  }
});

// ---------- Podpowiedź instalacji (iPhone/iPad w Safari, poza trybem aplikacji) ----------
(() => {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
  let dismissed = false;
  try { dismissed = localStorage.getItem('grafik-install-hint') === '1'; } catch (e) { /* brak */ }
  if (ios && !standalone && !dismissed) $('installHint').hidden = false;
  $('installClose').onclick = () => {
    $('installHint').hidden = true;
    try { localStorage.setItem('grafik-install-hint', '1'); } catch (e) { /* brak */ }
  };
})();

// ---------- Offline + trwały zapis ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

window.addEventListener('resize', () => { if (data.View === 'kalendarz') renderCalendar(); });
render();
