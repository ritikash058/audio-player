const $ = (id) => document.getElementById(id);

const audio     = $('audio');
const carousel  = $('carousel');
const backdrop  = $('backdrop');
const playBtn   = $('playBtn');
const playIcon  = $('playIcon');
const seek      = $('seek');

const PLAY_PATH  = 'M8 5v14l11-7z';
const PAUSE_PATH = 'M6 5h4v14H6zM14 5h4v14h-4z';

// Each track: { title, artist, src, cover }
let tracks = [];
let index = 0;

const DEFAULT_COVER = 'cover.jpg'; // shared cover; falls back to ♪ if missing

/* ---------- Load tracks from the /music folder (Electron preload) ---------- */
async function loadTracks() {
  try {
    const list = await window.electronAPI.listMusic();
    return (list || []).map((t) => ({ ...t, cover: t.cover || DEFAULT_COVER }));
  } catch (err) {
    console.error('Could not load music folder', err);
    return [];
  }
}

/* ---------- Turn a file path into something <audio> can play ---------- */
function toPlayableSrc(src) {
  if (!src) return '';
  // Already a URL (file://, http://, blob:, data:, custom protocol...) → leave it
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(src) || /^(blob|data):/i.test(src)) return src;

  const isWindowsAbs = /^[a-zA-Z]:[\\/]/.test(src);
  const isPosixAbs   = src.startsWith('/') && !src.startsWith('//');
  if (!isWindowsAbs && !isPosixAbs) return src; // relative path like "music/song.mp3"

  // Absolute path → file:// URL (encode spaces, #, ? etc. in each segment)
  const parts = src.replace(/\\/g, '/').split('/').map((p, i) =>
    i === 0 && /^[a-zA-Z]:$/.test(p) ? p : encodeURIComponent(p)
  );
  return 'file://' + (isWindowsAbs ? '/' : '') + parts.join('/');
}

function showError(msg) {
  console.error('[player]', msg, '| src =', audio.src);
  $('npArtist').textContent = '⚠ ' + msg;
}

function safePlay() {
  const p = audio.play();
  if (p) p.catch((err) => {
    if (err.name === 'AbortError') return; // happens when switching tracks quickly — harmless
    showError(`Can't play: ${err.message || err.name}`);
  });
}

/* ---------- Helpers ---------- */
const fmt = (s) => {
  if (!isFinite(s)) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, '0');
  return `${m}:${sec}`;
};


/* ---------- Rendering (one card at a time) ---------- */
function renderCard(direction) {
  carousel.innerHTML = '';

  if (!tracks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = '<span>♪</span>No music found in /music folder';
    carousel.appendChild(empty);
    return;
  }

  const t = tracks[index];
  const card = document.createElement('div');
  card.className = 'card' + (direction ? ` from-${direction}` : '') + (!audio.paused ? ' playing' : '');

  if (t.cover) {
    const img = document.createElement('img');
    img.src = t.cover;
    img.alt = t.title || '';
    img.onerror = () => { card.textContent = '♪'; backdrop.style.backgroundImage = ''; };
    card.appendChild(img);
  } else {
    card.textContent = '♪';
  }
  carousel.appendChild(card);
}

function updateInfo() {
  const has = tracks.length > 0;
  const t = tracks[index];

  $('npTitle').textContent  = has ? (t.title || 'Unknown title') : 'No track selected';
  $('npArtist').textContent = has ? (t.artist || 'Unknown artist') : 'Add some music to get started';
  $('counter').textContent  = has ? `${index + 1} / ${tracks.length}` : '0 / 0';

  const next = has && tracks.length > 1 ? tracks[(index + 1) % tracks.length] : null;
  $('upNext').textContent = next ? `Up next: ${next.title || 'Unknown'}` : '';

  backdrop.style.backgroundImage = has && t.cover ? `url("${t.cover}")` : '';

  playBtn.disabled = !has;
  ['prev', 'next', 'prevTrack', 'nextTrack'].forEach((id) => ($(id).disabled = tracks.length < 2));
}

function setPlayIcon() {
  playIcon.querySelector('path').setAttribute('d', audio.paused ? PLAY_PATH : PAUSE_PATH);
  playBtn.setAttribute('aria-label', audio.paused ? 'Play' : 'Pause');
  const card = carousel.querySelector('.card');
  if (card) card.classList.toggle('playing', !audio.paused);
}

/* ---------- Playback ---------- */
function select(i, { autoplay = false, direction = null } = {}) {
  if (!tracks.length) { renderCard(); updateInfo(); return; }

  const wasPlaying = !audio.paused;
  index = (i + tracks.length) % tracks.length;

  audio.src = toPlayableSrc(tracks[index].src);
  audio.load();
  seek.value = 0;
  seek.style.setProperty('--pct', '0%');
  $('current').textContent = '0:00';
  $('duration').textContent = '0:00';

  renderCard(direction);
  updateInfo();

  if (autoplay || wasPlaying) safePlay();
  setPlayIcon();
}

const nextTrack = () => tracks.length > 1 && select(index + 1, { direction: 'right' });
const prevTrack = () => {
  if (audio.currentTime > 3) { audio.currentTime = 0; return; } // restart first, like most players
  if (tracks.length > 1) select(index - 1, { direction: 'left' });
};

function togglePlay() {
  if (!tracks.length) return;
  if (audio.paused) safePlay(); else audio.pause();
}

/* ---------- Events ---------- */
playBtn.addEventListener('click', togglePlay);
$('next').addEventListener('click', nextTrack);
$('nextTrack').addEventListener('click', nextTrack);
$('prev').addEventListener('click', () => tracks.length > 1 && select(index - 1, { direction: 'left' }));
$('prevTrack').addEventListener('click', prevTrack);

audio.addEventListener('error', () => {
  const codes = { 1: 'loading aborted', 2: 'network error', 3: 'file could not be decoded', 4: 'file not found or format not supported' };
  showError(`Can't play: ${codes[audio.error && audio.error.code] || 'unknown error'}`);
  setPlayIcon();
});
audio.addEventListener('play', setPlayIcon);
audio.addEventListener('pause', setPlayIcon);
audio.addEventListener('ended', () => {
  if (tracks.length > 1) select(index + 1, { autoplay: true, direction: 'right' });
  else setPlayIcon();
});
audio.addEventListener('loadedmetadata', () => {
  $('duration').textContent = fmt(audio.duration);
});
audio.addEventListener('timeupdate', () => {
  if (!audio.duration) return;
  const pct = (audio.currentTime / audio.duration) * 100;
  seek.value = pct;
  seek.style.setProperty('--pct', pct + '%');
  $('current').textContent = fmt(audio.currentTime);
});

seek.addEventListener('input', () => {
  seek.style.setProperty('--pct', seek.value + '%');
  if (audio.duration) audio.currentTime = (seek.value / 100) * audio.duration;
});

// Keyboard: space = play/pause, ←/→ = previous/next
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' && e.target.type !== 'range') return;
  // A focused button already "clicks" on Space — don't toggle twice
  if (e.code === 'Space' && e.target.tagName === 'BUTTON') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  if (e.code === 'ArrowRight') nextTrack();
  if (e.code === 'ArrowLeft')  prevTrack();
});

// Swipe on the cover to change track
let touchX = null;
carousel.addEventListener('touchstart', (e) => (touchX = e.touches[0].clientX), { passive: true });
carousel.addEventListener('touchend', (e) => {
  if (touchX === null) return;
  const dx = e.changedTouches[0].clientX - touchX;
  if (Math.abs(dx) > 40) dx < 0 ? nextTrack() : prevTrack();
  touchX = null;
});


async function init() {
  // Remember what was selected so Refresh doesn't jump back to track 1
  const currentSrc = tracks[index] && tracks[index].src;
  tracks = await loadTracks();
  const found = tracks.findIndex((t) => t.src === currentSrc);
  index = found >= 0 ? found : 0;
  if (found >= 0 && audio.src) { renderCard(); updateInfo(); setPlayIcon(); }
  else select(index);
}
$('close-btn').addEventListener('click', () => window.electronAPI.close());
$('minimize-btn').addEventListener('click', () => window.electronAPI.minimize());
$('maximize-btn').addEventListener('click', () => window.electronAPI.maximize());

init();