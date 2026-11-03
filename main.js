const { app, BrowserWindow, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');

app.setName('Music Player');

// Register custom protocol BEFORE app is ready
protocol.registerSchemesAsPrivileged([
    {
        scheme: 'music',
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true }
    }
]);

const MUSIC_DIR = path.join(__dirname, 'music');

const MIME = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4'
};

/*
 * Serves music://local/<encoded filename> from ./music
 *
 * Because the scheme is "standard", Chromium treats the part after music://
 * as a host name (it lowercases it and adds a trailing "/"). So the file name
 * goes in the *path* after a fixed host ("local"), where its case is kept.
 *
 * Range requests are handled so the seek bar works and duration is correct.
 */
async function serveMusic(request) {
  const { pathname } = new URL(request.url);
  const fileName = decodeURIComponent(pathname.replace(/^\/+/, ''));
  const filePath = path.resolve(MUSIC_DIR, fileName);

  // Safety check: prevent path traversal (../../something)
  const rel = path.relative(MUSIC_DIR, filePath);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return new Response('Forbidden', { status: 403 });
  }

  let stat;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    console.error('[music] not found:', filePath);
    return new Response('Not found', { status: 404 });
  }

  const size = stat.size;
  const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
  const range = request.headers.get('range');

  if (range) {
    const m = /bytes=(\d*)-(\d*)/.exec(range);
    let start, end;
    if (m && m[1] === '' && m[2] !== '') {        // "bytes=-500" → last 500 bytes
      start = Math.max(size - parseInt(m[2], 10), 0);
      end = size - 1;
    } else {
      start = m && m[1] ? parseInt(m[1], 10) : 0;
      end = m && m[2] ? Math.min(parseInt(m[2], 10), size - 1) : size - 1;
    }

    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }

    return new Response(Readable.toWeb(fs.createReadStream(filePath, { start, end })), {
      status: 206,
      headers: {
        'Content-Type': type,
        'Content-Length': String(end - start + 1),
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Accept-Ranges': 'bytes'
      }
    });
  }

  return new Response(Readable.toWeb(fs.createReadStream(filePath)), {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(size),
      'Accept-Ranges': 'bytes'
    }
  });
}

function listMusic() {
  if (!fs.existsSync(MUSIC_DIR)) return [];

  const files = fs.readdirSync(MUSIC_DIR).filter((f) =>
    /\.(mp3|wav|ogg|flac|m4a)$/i.test(f)
  );

  return files.map((file) => {
    const base = file.replace(/\.[^.]+$/, '');
    // Try "Artist - Title" pattern
    const parts = base.split(' - ');
    const artist = parts.length > 1 ? parts[0].trim() : 'Unknown Artist';
    const title  = parts.length > 1 ? parts.slice(1).join(' - ').trim() : base;

    return {
      file,
      title,
      artist,
      src: `music://local/${encodeURIComponent(file)}`
    };
  });
}

app.whenReady().then(() => {
  protocol.handle('music', serveMusic);
  ipcMain.handle('music:list', async () => listMusic());

  const win = new BrowserWindow({
    width: 500,
    height: 600,
    backgroundColor: '#121212',
    resizable: false,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile('index.html');
  win.setMenuBarVisibility(false);
  ipcMain.on('closeApp', () => {
        win.close();
    });
    ipcMain.on('minimizeApp', () => {
      win.minimize();
    });
    ipcMain.on('maximizeApp', () => {
      win.maximize();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

module.exports = { serveMusic, listMusic }; 