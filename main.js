const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const os = require('os');
const { execFile, spawn } = require('child_process');
const sudo = require('sudo-prompt');
const fs = require('fs');
const https = require('https');

let mainWindow;

function commandExists(cmd) {
  const dirs = (process.env.PATH || '').split(path.delimiter);
  return dirs.some(d => { try { return fs.existsSync(path.join(d, cmd)); } catch { return false; } });
}

const PM = (() => {
  if (commandExists('apt-cache') && commandExists('apt-get')) return 'apt';
  if (commandExists('dnf')) return 'dnf';
  if (commandExists('yum')) return 'yum';
  if (commandExists('pacman')) return 'pacman';
  if (commandExists('zypper')) return 'zypper';
  if (commandExists('apk')) return 'apk';
  if (commandExists('xbps-install')) return 'xbps';
  return null;
})();
const HAS_FLATPAK = commandExists('flatpak');
const HAS_SNAP = commandExists('snap');

// ---------- cache helpers ----------
const CACHE_DIR = path.join(os.homedir(), '.cache', 'compass');
const CACHE_FILE = path.join(CACHE_DIR, 'packages-cache.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 1 day
const CACHE_VERSION = 3;

function ensureCacheDir() { try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {} }
function loadCache() {
  try { if (fs.existsSync(CACHE_FILE)) return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); } catch {}
  return null;
}
function saveCache(data) {
  data.cacheVersion = CACHE_VERSION;
  ensureCacheDir();
  fs.writeFileSync(CACHE_FILE, JSON.stringify(data));
}
function isCacheFresh(ts) { return ts && (Date.now() - ts) < CACHE_TTL; }

// ---------- system package list builders ----------
function spawnGetOutput(cmd, args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    let out = '';
    const child = spawn(cmd, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 });
    child.stdout.on('data', (chunk) => out += chunk.toString());
    child.stderr.on('data', () => {});
    child.on('close', (code) => resolve(code === 0 ? out : ''));
    child.on('error', () => resolve(''));
  });
}

function execAsync(cmd, args, timeoutMs = 60000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({ error, stdout: stdout || '', stderr: stderr || '' });
    });
  });
}

async function fetchAllSystemPackages() {
  if (!PM) return [];
  if (PM === 'apt') {
    const raw = await spawnGetOutput('apt-cache', ['dumpavail'], 120000);
    if (!raw) return [];
    const entries = [];
    let cur = {};
    for (const line of raw.split('\n')) {
      if (line.startsWith('Package: ')) {
        if (cur.name) entries.push(cur);
        cur = { name: line.substring(9).trim(), description: '', section: '' };
      } else if (line.startsWith('Section: ')) {
        cur.section = line.substring(9).trim();
      } else if (line.startsWith('Description: ')) {
        cur.description = line.substring(13).trim();
      }
    }
    if (cur.name) entries.push(cur);
    const appSections = /^(gnome|kde|xfce|mate|cinnamon|budgie|deepin|lxde|lxqt|enlightenment|games|graphics|mail|net|web|office|sound|video|utils|admin|editors|accessories|text|science|electronics|embedded|fonts|localization|hamradio|oldlibs|libs|devel|debug|doc|kernel)/;
    const excludeSections = /^(libs|libdevel|devel|debug|doc|kernel|oldlibs|fonts|localization)/;
    return entries.filter(e => {
      const s = (e.section || '').toLowerCase();
      if (!appSections.test(s)) return false;
      if (excludeSections.test(s)) return false;
      const n = e.name.toLowerCase();
      if (/^(lib[a-z0-9]|lib32-|python3?-|ruby-|perl-|php-|lua-|r-cran-|node-|golang-|haskell-|mingw-w64-|xserver-xorg-video|firmware-|linux-modules-)/.test(n)) return false;
      if (/[-_](dev|dbg|doc|data|headers|tests?|demos?|examples|static|compat|locale|langpacks?)$/i.test(n)) return false;
      return true;
    }).map(e => ({ name: e.name, description: e.description, source: 'System', pm: 'apt', id: e.name }));
  }
  if (PM === 'dnf' || PM === 'yum') {
    const raw = await spawnGetOutput('dnf', ['repoquery', '--available', '--qf', '%{name}\t%{group}\t%{summary}'], 120000);
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(line => {
      const [name, group, summary] = line.split('\t');
      return { name, description: summary || '', section: group || '', source: 'System', pm: PM, id: name };
    }).filter(a => {
      const g = (a.section || '').toLowerCase();
      return g.startsWith('applications/') || g.startsWith('productivity/') || g.startsWith('system/') || g.startsWith('desktop/');
    });
  }
  if (PM === 'pacman') {
    const raw = await spawnGetOutput('pacman', ['-Sl'], 120000);
    if (!raw) return [];
    const apps = [];
    for (const line of raw.split('\n')) {
      const m = line.match(/^\S+\/(\S+)\s+(\S+)\s+(.*)$/);
      if (!m) continue;
      const name = m[1];
      const desc = m[3] || '';
      const n = name.toLowerCase();
      if (/^(lib[a-z0-9]|lib32-|python3?-|ruby-|perl-|php-|lua-|r-cran-|node-|golang-|haskell-|mingw-w64-|xserver-xorg-video|firmware-|linux-modules-)/.test(n)) continue;
      if (/[-_](dev|dbg|doc|data|headers|tests?|demos?|examples|static|compat|locale|langpacks?)$/i.test(n)) continue;
      if (/^(coreutils|grep|sed|awk|bash|zsh|util-linux|systemd|sysvinit|initscripts|login|passwd|shadow|procps|psmisc|findutils|debianutils|dpkg|rpm|pacman|yum|dnf|zypper|apk-tools|xbps|sudo|apt|apt-get|apt-cache|pulseaudio|alsa|network-manager|bluez|openssh|tcpdump|wireshark|curl|wget|git|make|gcc|g\+\+|man-db|manpages|info)$/i.test(n)) continue;
      apps.push({ name, description: desc, source: 'System', pm: 'pacman', id: name });
    }
    return apps;
  }
  if (PM === 'zypper') {
    const raw = await spawnGetOutput('zypper', ['--no-refresh', 'search', '-s', '*'], 120000);
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(line => {
      const parts = line.split('|').map(s => s.trim());
      if (parts.length < 4 || parts[1] === 'Name') return null;
      const name = parts[1];
      const n = name.toLowerCase();
      if (/^(lib[a-z0-9]|lib32-|python3?-|ruby-|perl-|php-|lua-|r-cran-|node-|golang-|haskell-|mingw-w64-|xserver-xorg-video|firmware-|linux-modules-)/.test(n)) return null;
      if (/[-_](dev|dbg|doc|data|headers|tests?|demos?|examples|static|compat|locale|langpacks?)$/i.test(n)) return null;
      return { name, description: parts[3] || '', source: 'System', pm: 'zypper', id: name };
    }).filter(Boolean);
  }
  if (PM === 'apk') {
    const raw = await spawnGetOutput('apk', ['search', '-v', '-q', ''], 120000);
    if (!raw) return [];
    return raw.split('\n').filter(Boolean).map(line => {
      const idx = line.indexOf(' - ');
      const name = idx > -1 ? line.substring(0, idx).trim() : line.trim();
      const desc = idx > -1 ? line.substring(idx + 3).trim() : '';
      const n = name.toLowerCase();
      if (/^(lib[a-z0-9]|lib32-|python3?-|ruby-|perl-|php-|lua-|r-cran-|node-|golang-|haskell-|mingw-w64-|xserver-xorg-video|firmware-|linux-modules-)/.test(n)) return null;
      if (/[-_](dev|dbg|doc|data|headers|tests?|demos?|examples|static|compat|locale|langpacks?)$/i.test(n)) return null;
      return { name, description: desc, source: 'System', pm: 'apk', id: name };
    }).filter(Boolean);
  }
  if (PM === 'xbps') {
    const raw = await spawnGetOutput('xbps-query', ['-Rs', ''], 120000);
    if (!raw) return [];
    const apps = [];
    for (const line of raw.split('\n')) {
      const m = line.match(/^\[[* -]\]\s+(\S+)-[\d.]+\S*\s+(.*)$/);
      if (m) {
        const name = m[1];
        const n = name.toLowerCase();
        if (/^(lib[a-z0-9]|lib32-|python3?-|ruby-|perl-|php-|lua-|r-cran-|node-|golang-|haskell-|mingw-w64-|xserver-xorg-video|firmware-|linux-modules-)/.test(n)) continue;
        if (/[-_](dev|dbg|doc|data|headers|tests?|demos?|examples|static|compat|locale|langpacks?)$/i.test(n)) continue;
        apps.push({ name, description: m[2] || '', source: 'System', pm: 'xbps', id: name });
      }
    }
    return apps;
  }
  return [];
}

async function fetchAllFlatpakPackages() {
  if (!HAS_FLATPAK) return [];
  await ensureFlathubRemoteAsync();
  const raw = await spawnGetOutput('flatpak', ['remote-ls', '--app', '--columns=application,name,description', 'flathub'], 120000);
  if (!raw) return [];
  return raw.split('\n').filter(Boolean).map(line => {
    const [id, name, desc] = line.split('\t');
    return { name: name || id, description: desc || '', source: 'Flatpak', id, pm: 'flatpak' };
  });
}

async function fetchAllSnapPackages() {
  if (!HAS_SNAP) return [];
  console.error('[Snap] Fetching from snapd...');
  const { error, stdout, stderr } = await execAsync('snap', ['find'], 120000);
  if (error) {
    console.error('[Snap] snap find failed:', error.message);
    console.error('[Snap] stderr:', stderr);
    return [];
  }
  console.error(`[Snap] Raw output length: ${stdout.length}`);
  if (!stdout.trim()) {
    console.error('[Snap] snap find returned empty output – is snapd running?');
    return [];
  }
  const lines = stdout.split('\n');
  if (lines.length <= 1) {
    console.error('[Snap] Only header or no lines in snap output');
    return [];
  }
  const snaps = lines.slice(1).map(line => {
    const parts = line.split(/\s{2,}/).filter(Boolean);
    return {
      name: parts[0],
      description: parts.slice(1).join(' ') || '',
      source: 'Snap',
      id: parts[0],
      pm: 'snap'
    };
  }).filter(a => !['core','snapd','core18','core20','core22','core24'].includes(a.id));
  console.error(`[Snap] Parsed ${snaps.length} Snap packages`);
  return snaps;
}

let cachedPackages = { system: [], flatpak: [], snap: [] };
let cacheReady = false;
let cacheBuilding = false;

function sendCacheStatus(event, percent, text) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('cache-status', { event, percent, text });
  }
}

async function buildCache() {
  if (cacheBuilding) return;
  cacheBuilding = true;
  sendCacheStatus('started', 0, 'Building application list...');
  try {
    const systemPromise = fetchAllSystemPackages().then(res => {
      sendCacheStatus('progress', 33, 'System packages loaded...');
      return res;
    });
    const flatpakPromise = fetchAllFlatpakPackages().then(res => {
      sendCacheStatus('progress', 66, 'Flatpak packages loaded...');
      return res;
    });
    const snapPromise = fetchAllSnapPackages().then(res => {
      sendCacheStatus('progress', 90, 'Snap packages loaded...');
      return res;
    });
    const [system, flatpak, snap] = await Promise.all([systemPromise, flatpakPromise, snapPromise]);
    cachedPackages = { system, flatpak, snap };
    saveCache({ timestamp: Date.now(), system, flatpak, snap });
    cacheReady = true;
    sendCacheStatus('finished', 100, 'Ready');
  } catch (e) {
    console.error('Cache build failed:', e);
    cacheReady = true;
    sendCacheStatus('finished', 100, 'Cache build failed (using limited data)');
  }
  cacheBuilding = false;
}

function loadCacheFromDisk() {
  const stored = loadCache();
  if (stored && isCacheFresh(stored.timestamp) && stored.cacheVersion === CACHE_VERSION) {
    cachedPackages = { system: stored.system || [], flatpak: stored.flatpak || [], snap: stored.snap || [] };
    cacheReady = true;
    sendCacheStatus('finished', 100, 'Cache loaded from disk');
    return true;
  }
  return false;
}

async function ensureCacheReady() {
  if (cacheReady) return;
  if (!loadCacheFromDisk()) {
    buildCache().catch(() => {});
  }
}

function searchAllCached(query) {
  const q = query.toLowerCase();
  const match = (p) => p.name.toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q);
  return {
    flatpak: (cachedPackages.flatpak || []).filter(match).slice(0, 50),
    snap: (cachedPackages.snap || []).filter(match).slice(0, 50),
    system: (cachedPackages.system || []).filter(match).slice(0, 50)
  };
}

// ---------- Window creation (icon.svg) ----------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1000, height: 700,
    transparent: true, frame: false,
    backgroundColor: '#00000000', // <-- ADDED: fully transparent background
    hasShadow: false,             // <-- ADDED: prevent rectangular shadow behind rounded corners
    roundedCorners: true,         // <-- ADDED: native rounded corners (macOS, harmless elsewhere)
    icon: path.join(__dirname, 'icon.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  mainWindow.loadFile('index.html');
  mainWindow.on('maximize', () => mainWindow.webContents.send('window-maximized', true));
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window-maximized', false));
}

app.whenReady().then(() => {
  createWindow();
  ensureCacheReady();
});
app.on('window-all-closed', () => app.quit());

// ---------- IPC handlers ----------
ipcMain.handle('get-package-managers', async () => ({ pm: PM, hasFlatpak: HAS_FLATPAK, hasSnap: HAS_SNAP }));

ipcMain.handle('search-apps', async (event, query) => {
  if (typeof query !== 'string' || !query.trim()) {
    event.sender.send('search-results', []);
    return [];
  }
  await ensureCacheReady();
  const resultSets = searchAllCached(query);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('search-partial', { source: 'flatpak', apps: resultSets.flatpak, query });
    mainWindow.webContents.send('search-partial', { source: 'snap', apps: resultSets.snap, query });
    mainWindow.webContents.send('search-partial', { source: 'system', apps: resultSets.system, query });
  }
  return [];
});

// ---------- Rest of the main.js code (from the original MAINJS_REST) ----------

function isLikelyApp(name) {
  if (!name || name.length < 2) return false;
  const low = name.toLowerCase();
  if (/^(libreoffice|librewolf|librecad|librealsense|libre)/i.test(low)) return true;
  if (/^(lib[a-z0-9]|lib32-|python3?-|ruby-|perl-|php-|lua-|r-cran-|node-|golang-|haskell-|mingw-w64-|xserver-xorg-video|firmware-|linux-modules-)/.test(low)) return false;
  if (/[-_](dev|doc|dbg|data|common|utils|tools|examples|headers|modules|plugins?|extensions?|runtime|devel|debug|static|tests?|demos?|meta|compat|locale|langpacks?)$/i.test(low)) return false;
  if (/^(coreutils|grep|sed|awk|bash|zsh|util-linux|systemd|sysvinit|initscripts|login|passwd|shadow|procps|psmisc|findutils|debianutils|dpkg|rpm|pacman|yum|dnf|zypper|apk-tools|xbps|sudo|apt|apt-get|apt-cache|pulseaudio|alsa|network-manager|bluez|openssh|tcpdump|wireshark|curl|wget|git|make|gcc|g\+\+|man-db|manpages|info)$/i.test(low)) return false;
  return true;
}

function run(cmd, args, timeout = 15000) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout }, (err, stdout) => {
      resolve({ err, stdout: stdout || '' });
    });
  });
}

function sudoExec(cmd) {
  return new Promise((resolve) => {
    sudo.exec(cmd, { name: 'Compass' }, (err) => resolve(err ? { success: false, error: err.message } : { success: true }));
  });
}

const activeInstalls = new Map();
function emitInstallProgress(id, patch) {
  const next = { ...(activeInstalls.get(id) || {}), ...patch };
  activeInstalls.set(id, next);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('install-progress', { id, ...next });
}

ipcMain.handle('get-active-installs', async () => [...activeInstalls.entries()].map(([id, v]) => ({ id, ...v })));

function parseFlatpakProgress(chunk) {
  const m = chunk.match(/(\d{1,3})%/g);
  if (!m) return null;
  return { percent: Math.min(99, parseInt(m[m.length-1], 10)), text: chunk.split(/\r/).pop().replace(/\s+/g, ' ').trim() || 'Installing…' };
}

function parseNativeProgress(chunk) {
  for (const line of chunk.split(/\r?\n/)) {
    let m;
    if ((m = line.match(/Unpacking\s+(\S+)/))) return { percent: 55, text: `Unpacking ${m[1]}` };
    if ((m = line.match(/Setting up\s+(\S+)/))) return { percent: 85, text: `Configuring ${m[1]}` };
    if ((m = line.match(/^Installing[: ]+(\S+)/) || line.match(/^installing\s+(\S+)/) || line.match(/^upgrading\s+(\S+)/))) return { percent: 45, text: `Installing ${m[1]}` };
    if (/^(Get:|Fetched|Downloading)/.test(line)) return { percent: 20, text: 'Downloading…' };
    if (/Reading package lists|Building dependency tree|Resolving dependencies/.test(line)) return { percent: 10, text: 'Resolving dependencies…' };
  }
  return null;
}

function installWithProgress(pkgInfo, cmd, parseProgress) {
  return new Promise((resolve) => {
    emitInstallProgress(pkgInfo.id, { name: pkgInfo.name, source: pkgInfo.source, percent: 1, text: 'Starting…', done: false });
    const logPath = path.join(os.tmpdir(), `compass-install-${pkgInfo.id.replace(/[^a-zA-Z0-9]/g,'_')}-${Date.now()}.log`);
    try { fs.writeFileSync(logPath, ''); } catch {}

    let pos = 0;
    const timer = setInterval(() => {
      try {
        const stat = fs.statSync(logPath);
        if (stat.size > pos) {
          const fd = fs.openSync(logPath, 'r');
          const buf = Buffer.alloc(stat.size - pos);
          fs.readSync(fd, buf, 0, buf.length, pos);
          fs.closeSync(fd);
          pos = stat.size;
          const prog = parseProgress(buf.toString());
          if (prog) emitInstallProgress(pkgInfo.id, prog);
        }
      } catch {}
    }, 400);

    const fullCmd = typeof cmd === 'string' ? cmd : `${cmd} ${cmd.args.join(' ')}`;
    const finalCmd = `${fullCmd} > "${logPath}" 2>&1`;

    sudo.exec(finalCmd, { name: 'Compass' }, (err) => {
      clearInterval(timer);
      let tail = '';
      try { tail = fs.readFileSync(logPath, 'utf8').slice(-1000); } catch {}
      fs.unlink(logPath, () => {});
      const success = !err;
      let error = success ? null : (err.message || tail.trim() || 'Installation failed');
      if (!success && tail && !err.message.includes(tail)) {
        error = tail.trim();
      }
      emitInstallProgress(pkgInfo.id, { percent: 100, done: true, success, error, text: success ? 'Installed' : (error || 'Failed') });
      resolve({ success, error });
    });
  });
}

function installNative(pkgInfo, cmd, args) {
  return installWithProgress(pkgInfo, { cmd, args }, parseNativeProgress).then(r => {
    if (r.success) refreshDesktopMenu();
    return r;
  });
}

async function installSnap(pkgInfo, retried = false) {
  const r = await installWithProgress(pkgInfo, `snap install ${pkgInfo.id}`, parseNativeProgress);
  if (!r.success && !retried && /classic confinement|--classic/i.test(r.error || '')) {
    emitInstallProgress(pkgInfo.id, { percent: 2, text: 'Retrying with classic confinement…' });
    return installSnap(pkgInfo, true);
  }
  if (r.success) refreshDesktopMenu();
  return r;
}

function installFlatpak(pkgInfo, retried = false) {
  return new Promise((resolve) => {
    emitInstallProgress(pkgInfo.id, { name: pkgInfo.name, source: 'Flatpak', percent: 1, text: 'Checking remote…', done: false });

    function attempt() {
      const child = spawn('flatpak', ['install', '--system', '-y', 'flathub', pkgInfo.id], { timeout: 30 * 60 * 1000 });
      let tail = '';
      child.stdout.on('data', (buf) => {
        const chunk = buf.toString();
        tail = (tail + chunk).slice(-2000);
        const prog = parseFlatpakProgress(chunk);
        if (prog) emitInstallProgress(pkgInfo.id, prog);
      });
      child.stderr.on('data', (buf) => { tail = (tail + buf.toString()).slice(-2000); });
      child.on('error', (e) => {
        emitInstallProgress(pkgInfo.id, { percent: 100, done: true, success: false, error: e.message });
        resolve({ success: false, error: e.message });
      });
      child.on('close', (code) => {
        const success = code === 0;
        if (!success && !retried && /no remote|not found in|remote ref|no such ref/i.test(tail)) {
          flathubRemoteConfirmed = false;
          emitInstallProgress(pkgInfo.id, { percent: 2, text: 'Re-adding Flathub remote…' });
          ensureFlathubRemote(() => { retried = true; attempt(); });
          return;
        }
        const error = success ? null : (tail.trim() || `flatpak exited with code ${code}`);
        if (success) refreshDesktopMenu();
        emitInstallProgress(pkgInfo.id, { percent: 100, done: true, success, error, text: success ? 'Installed' : (error || 'Failed') });
        resolve({ success, error });
      });
    }

    ensureFlathubRemote(() => attempt());
  });
}

function refreshDesktopMenu() {
  const appDirs = [
    path.join(os.homedir(), '.local/share/applications'),
    path.join(os.homedir(), '.local/share/flatpak/exports/share/applications'),
    '/var/lib/flatpak/exports/share/applications'
  ];
  appDirs.forEach(dir => execFile('update-desktop-database', [dir], () => {}));
  execFile('gtk-update-icon-cache', ['-f', '-t', path.join(os.homedir(), '.local/share/icons/hicolor')], () => {});
}

let flathubRemoteConfirmed = false;
function ensureFlathubRemote(cb) {
  if (flathubRemoteConfirmed) return cb();
  execFile('flatpak', ['remote-list', '--system'], (err, stdout) => {
    const hasRemote = !err && /flathub/i.test(stdout || '');
    const afterRemote = () => {
      execFile('flatpak', ['update', '--appstream', '--system', 'flathub'], { timeout: 120000 }, (updateErr) => {
        if (!updateErr) flathubRemoteConfirmed = true;
        cb();
      });
    };
    if (hasRemote) return afterRemote();
    sudo.exec('flatpak remote-add --system --if-not-exists flathub https://flathub.org/repo/flathub.flatpakrepo', { name: 'Compass' }, (addErr) => {
      if (addErr) { cb(); return; }
      afterRemote();
    });
  });
}
function ensureFlathubRemoteAsync() {
  return new Promise((resolve) => ensureFlathubRemote(resolve));
}

ipcMain.handle('install-app', async (event, pkgInfo) => {
  if (!pkgInfo?.id || !/^[A-Za-z0-9_.+:@/-]+$/.test(pkgInfo.id)) return { success: false, error: 'Invalid package' };
  if (pkgInfo.source === 'Flatpak') return installFlatpak(pkgInfo);
  if (pkgInfo.source === 'Snap') return installSnap(pkgInfo);
  switch (PM) {
    case 'apt': return installNative(pkgInfo, 'apt-get', ['install', '-y', pkgInfo.id]);
    case 'dnf': return installNative(pkgInfo, 'dnf', ['install', '-y', pkgInfo.id]);
    case 'yum': return installNative(pkgInfo, 'yum', ['install', '-y', pkgInfo.id]);
    case 'pacman': return installNative(pkgInfo, 'pacman', ['-S', '--noconfirm', pkgInfo.id]);
    case 'zypper': return installNative(pkgInfo, 'zypper', ['install', '-y', pkgInfo.id]);
    case 'apk': return installNative(pkgInfo, 'apk', ['add', pkgInfo.id]);
    case 'xbps': return installNative(pkgInfo, 'xbps-install', ['-y', pkgInfo.id]);
    default: return { success: false, error: 'Your distro\'s PM is not supported for native installs. Use Flatpak or Snap instead.' };
  }
});

async function getDesktopFileOwners() {
  const desktopDirs = ['/usr/share/applications', '/usr/local/share/applications'];
  const desktopFiles = [];
  for (const dir of desktopDirs) {
    try {
      const files = fs.readdirSync(dir).filter(f => f.endsWith('.desktop'));
      for (const f of files) {
        const full = path.join(dir, f);
        try {
          const content = fs.readFileSync(full, 'utf8');
          if (/^NoDisplay=true/mi.test(content)) continue;
          if (/^Type=/mi.test(content) && !/^Type=Application/mi.test(content)) continue;
          desktopFiles.push(full);
        } catch {}
      }
    } catch {}
  }
  if (desktopFiles.length === 0) return new Set();
  const owners = new Set();
  const CHUNK = 150;
  for (let i = 0; i < desktopFiles.length; i += CHUNK) {
    const chunk = desktopFiles.slice(i, i + CHUNK);
    try {
      if (PM === 'apt') {
        const { stdout } = await run('dpkg', ['-S', ...chunk], 15000);
        for (const line of stdout.split('\n')) {
          const m = line.match(/^([^:]+):/);
          if (m) m[1].split(',').forEach(p => owners.add(p.trim()));
        }
      } else if (PM === 'dnf' || PM === 'yum' || PM === 'zypper') {
        const { stdout } = await run('rpm', ['-qf', '--qf', '%{NAME}\n', ...chunk], 15000);
        stdout.split('\n').map(s => s.trim()).filter(Boolean).forEach(p => owners.add(p));
      } else if (PM === 'pacman') {
        const { stdout } = await run('pacman', ['-Qqo', ...chunk], 15000);
        stdout.split('\n').map(s => s.trim()).filter(Boolean).forEach(p => owners.add(p));
      }
    } catch {}
  }
  return owners;
}

async function getInstalledNative() {
  const results = [];
  if (PM === 'apt') {
    const { stdout } = await run('dpkg-query', ['-W', `-f=\${Package}\x09\${Section}\x09\${Description}\x0a`], 15000);
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        results.push({ name: parts[0], description: parts[2] || '', source: 'System', pm: 'apt', id: parts[0], section: parts[1] || '' });
      }
    }
  } else if (PM === 'dnf' || PM === 'yum') {
    const { stdout } = await run('rpm', ['-qa', '--qf', `%{NAME}\x09%{GROUP}\x09%{SUMMARY}\x0a`], 15000);
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        results.push({ name: parts[0], description: parts[2] || '', source: 'System', pm: PM, id: parts[0], section: parts[1] || '' });
      }
    }
  } else if (PM === 'pacman') {
    const { stdout } = await run('pacman', ['-Q'], 15000);
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const [name] = line.split(' ');
      results.push({ name, description: '', source: 'System', pm: 'pacman', id: name, section: '' });
    }
  } else if (PM === 'zypper') {
    const { stdout } = await run('rpm', ['-qa', '--qf', `%{NAME}\x09%{GROUP}\x09%{SUMMARY}\x0a`], 15000);
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const parts = line.split('\t');
      if (parts.length >= 2) {
        results.push({ name: parts[0], description: parts[2] || '', source: 'System', pm: 'zypper', id: parts[0], section: parts[1] || '' });
      }
    }
  } else {
    const { stdout } = PM === 'apk' ? await run('apk', ['info'], 15000) : await run('xbps-query', ['-l'], 15000);
    for (const line of stdout.trim().split('\n').filter(Boolean)) {
      const name = line.split(' ')[0].trim();
      results.push({ name, description: '', source: 'System', pm: PM, id: name, section: '' });
    }
  }
  const desktopOwners = await getDesktopFileOwners();
  const haveReliableSignal = desktopOwners.size > 0;
  for (const r of results) {
    r.isApp = haveReliableSignal ? desktopOwners.has(r.name) : isLikelyApp(r.name);
  }
  return results;
}

async function getInstalledFlatpak() {
  if (!HAS_FLATPAK) return [];
  const { stdout } = await run('flatpak', ['list', '--columns=application,name'], 15000);
  return stdout.trim().split('\n').filter(Boolean).map(line => {
    const [id, name] = line.split('\t');
    return { name: name || id, description: '', source: 'Flatpak', id, section: '', isApp: true };
  });
}

async function getInstalledSnap() {
  if (!HAS_SNAP) return [];
  const { stdout } = await run('snap', ['list'], 15000);
  return stdout.trim().split('\n').slice(1).filter(Boolean).map(line => {
    const parts = line.split(/\s+/);
    return { name: parts[0], description: '', source: 'Snap', id: parts[0], section: '', isApp: true };
  });
}

ipcMain.handle('get-installed-apps', async () => {
  const [native, flatpak, snap] = await Promise.all([getInstalledNative(), getInstalledFlatpak(), getInstalledSnap()]);
  return [...native, ...flatpak, ...snap];
});

ipcMain.handle('uninstall-app', async (event, pkgInfo, purge) => {
  if (!pkgInfo?.id || !/^[A-Za-z0-9_.+:@/-]+$/.test(pkgInfo.id)) return { success: false, error: 'Invalid package' };
  if (pkgInfo.source === 'Flatpak') {
    const userAttempt = await run('flatpak', ['uninstall', '--user', '-y', pkgInfo.id], 60000);
    if (!userAttempt.err) return { success: true };
    if (/not installed|No installations/i.test(userAttempt.stdout || userAttempt.err.message || '')) {
      return sudoExec(`flatpak uninstall --system -y ${pkgInfo.id}`);
    }
    return { success: false, error: userAttempt.stdout || userAttempt.err.message };
  }
  if (pkgInfo.source === 'Snap') return sudoExec(`snap remove ${pkgInfo.id}`);
  switch (PM) {
    case 'apt': return sudoExec(purge ? `apt-get purge -y ${pkgInfo.id}` : `apt-get remove -y ${pkgInfo.id}`);
    case 'dnf': return sudoExec(`dnf remove -y ${pkgInfo.id}`);
    case 'yum': return sudoExec(`yum remove -y ${pkgInfo.id}`);
    case 'pacman': return sudoExec(purge ? `pacman -Rns --noconfirm ${pkgInfo.id}` : `pacman -R --noconfirm ${pkgInfo.id}`);
    case 'zypper': return sudoExec(`zypper remove -y ${pkgInfo.id}`);
    case 'apk': return sudoExec(`apk del ${pkgInfo.id}`);
    case 'xbps': return sudoExec(purge ? `xbps-remove -Ry ${pkgInfo.id}` : `xbps-remove -y ${pkgInfo.id}`);
    default: return { success: false, error: 'Your distro\'s PM is not supported for uninstalls.' };
  }
});

function fetchJson(url, timeoutMs = 8000, extraHeaders = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const req = https.get(url, { headers: { 'User-Agent': 'compass/2.0', ...extraHeaders } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return done(null); }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => { try { done(JSON.parse(data)); } catch { done(null); } });
      res.on('error', () => done(null));
    });
    req.on('error', () => done(null));
    req.setTimeout(timeoutMs, () => { req.destroy(); done(null); });
  });
}

function extractIcon(json) {
  if (!json) return null;
  if (typeof json.icon === 'string') return json.icon;
  const icons = json.icons || (json.metadata && json.metadata.icons) || [];
  if (Array.isArray(icons) && icons.length) {
    const sorted = icons.filter(i => i && (typeof i === 'string' || i.url))
      .map(i => typeof i === 'string' ? { url: i, width: 0 } : { ...i, width: parseInt(i.width, 10) || 0 })
      .sort((a, b) => b.width - a.width);
    const best = sorted[0];
    if (best && typeof best.url === 'string') return best.url;
    if (typeof best === 'string') return best;
  }
  if (typeof json.iconDesktopUrl === 'string') return json.iconDesktopUrl;
  return null;
}

function extractScreenshots(json) {
  if (!json || !Array.isArray(json.screenshots)) return [];
  return json.screenshots.flatMap(s => {
    if (typeof s === 'string') return s;
    if (!s) return [];
    if (Array.isArray(s.sizes) && s.sizes.length) return s.sizes[s.sizes.length - 1].src || [];
    if (typeof s.url === 'string') return s.url;
    if (typeof s.thumbUrl === 'string') return s.thumbUrl;
    return [];
  }).slice(0, 8);
}

function stripTags(html) { return (html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim(); }

async function fetchFlathubMeta(id) {
  const iconFallback = `https://dl.flathub.org/repo/appstream/x86_64/icons/128x128/${encodeURIComponent(id)}`;
  const json = await fetchJson(`https://flathub.org/api/v2/appstream/${encodeURIComponent(id)}`);
  if (!json) return { icon: iconFallback + '.svg', summary: '', description: '', screenshots: [] };
  const icon = extractIcon(json) || iconFallback + '.svg';
  return {
    icon,
    summary: stripTags(json.summary),
    description: stripTags(json.description || json.summary),
    screenshots: extractScreenshots(json)
  };
}

const metaCache = new Map();
function getMeta(key, fetcher) {
  if (metaCache.has(key)) return metaCache.get(key);
  const p = fetcher();
  metaCache.set(key, p);
  return p;
}

async function fetchSnapcraftMeta(id) {
  const json = await fetchJson(`https://api.snapcraft.io/v2/snaps/info/${encodeURIComponent(id)}`, 8000, { 'Snap-Device-Series': '16' });
  if (!json?.snap) return null;
  const media = json.snap.media || [];
  return {
    icon: (media.find(m => m.type === 'icon') || {}).url || null,
    summary: json.snap.summary || '',
    description: json.snap.description || json.snap.summary || '',
    screenshots: media.filter(m => m.type === 'screenshot').map(m => m.url).slice(0, 8)
  };
}

function findLocalIconMeta(pkgId) {
  return new Promise((resolve) => {
    const desktopDirs = ['/usr/share/applications', '/usr/local/share/applications'];
    let iconName = null, description = '';
    const needle = pkgId.toLowerCase();
    for (const dir of desktopDirs) {
      try {
        const files = fs.readdirSync(dir).filter(f => f.toLowerCase().includes(needle) && f.endsWith('.desktop'));
        for (const file of files) {
          const content = fs.readFileSync(path.join(dir, file), 'utf8');
          const iconMatch = content.match(/^Icon=(.+)$/m);
          const commentMatch = content.match(/^Comment=(.+)$/m);
          if (iconMatch) iconName = iconMatch[1].trim();
          if (commentMatch) description = commentMatch[1].trim();
          if (iconName) break;
        }
        if (iconName) break;
      } catch {}
    }
    if (!iconName) return resolve({ icon: null, summary: description, description, screenshots: [] });
    if (iconName.startsWith('/')) return resolve({ icon: 'file://' + iconName, summary: description, description, screenshots: [] });
    const iconDirs = ['/usr/share/icons/hicolor/256x256/apps','/usr/share/icons/hicolor/128x128/apps','/usr/share/icons/hicolor/64x64/apps','/usr/share/icons/hicolor/48x48/apps','/usr/share/pixmaps'];
    for (const dir of iconDirs) {
      for (const ext of ['.png','.svg','.xpm']) {
        const p = path.join(dir, iconName + ext);
        if (fs.existsSync(p)) return resolve({ icon: 'file://' + p, summary: description, description, screenshots: [] });
      }
    }
    resolve({ icon: null, summary: description, description, screenshots: [] });
  });
}

ipcMain.handle('get-app-meta', async (event, pkgInfo) => {
  if (!pkgInfo?.id) return null;
  try {
    if (pkgInfo.source === 'Flatpak') return await getMeta('flatpak:' + pkgInfo.id, () => fetchFlathubMeta(pkgInfo.id));
    if (pkgInfo.source === 'Snap') return await getMeta('snap:' + pkgInfo.id, () => fetchSnapcraftMeta(pkgInfo.id));
    if (pkgInfo.source === 'System') return await getMeta('local:' + pkgInfo.id, () => findLocalIconMeta(pkgInfo.id));
  } catch {}
  return null;
});

ipcMain.handle('launch-app', async (event, pkgInfo) => {
  if (!pkgInfo?.id) return { success: false, error: 'Invalid package' };
  try {
    if (pkgInfo.source === 'Flatpak') {
      spawn('flatpak', ['run', pkgInfo.id], { detached: true, stdio: 'ignore' }).unref();
      return { success: true };
    }
    if (pkgInfo.source === 'Snap') {
      spawn('snap', ['run', pkgInfo.id], { detached: true, stdio: 'ignore' }).unref();
      return { success: true };
    }
    return { success: false, error: 'Opening system packages directly isn\'t supported yet.' };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.on('minimize', () => mainWindow?.minimize());
ipcMain.on('maximize', () => mainWindow?.isMaximized() ? mainWindow.unmaximize() : mainWindow?.maximize());
ipcMain.on('close', () => mainWindow?.close());