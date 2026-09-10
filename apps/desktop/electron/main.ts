import {
  app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, powerMonitor,
  protocol, net, Tray, Menu, shell,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { leafPng } from './png';

const DIST = path.join(__dirname, '../dist');
const DEV_URL = process.env.VITE_DEV_SERVER_URL;

/**
 * Photos picked from disk are copied into the app's own folder and served over
 * a custom scheme. A plain file:// URL would be blocked from the renderer, and
 * referencing the original path would break the moment the file moved.
 */
const MEDIA_SCHEME = 'mission-media';
const mediaDir = () => path.join(app.getPath('userData'), 'media');

protocol.registerSchemesAsPrivileged([
  { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

// Windows groups toasts and taskbar entries by this id, and refuses to show a
// notification from an app that has not claimed one. Has to be set before the
// first window, so it goes here rather than inside whenReady.
app.setAppUserModelId('media.buzzcaf.missionreminder');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
/** Mirrors the renderer's session state so the tray and idle watcher can react. */
let sessionActive = false;

function createWindow() {
  win = new BrowserWindow({
    width: 1120,
    height: 760,
    minWidth: 880,
    minHeight: 620,
    backgroundColor: '#0d1512',
    title: 'Mission Reminder',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (DEV_URL) win.loadURL(DEV_URL);
  else win.loadFile(path.join(DIST, 'index.html'));

  // Leaving the window is the desktop equivalent of leaving the app on a phone.
  // The renderer decides what it costs; the main process only reports it.
  win.on('blur', () => win?.webContents.send('focus-changed', false));
  win.on('focus', () => win?.webContents.send('focus-changed', true));

  win.on('close', (e) => {
    // Closing mid-session would be a silent way to dodge the consequence, so
    // the window hides to the tray instead and the session keeps running.
    if (sessionActive && !(app as any).isQuitting) {
      e.preventDefault();
      win?.hide();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createTray() {
  // A leaf generated at startup, so there is no binary asset to ship. It has
  // to be a real PNG: createFromDataURL takes PNG and JPEG only, and the SVG
  // this used to pass produced an empty image -- an invisible tray icon, and
  // no way back into a window hidden during a session.
  tray = new Tray(nativeImage.createFromBuffer(leafPng(32)));
  tray.setToolTip('Mission Reminder');
  tray.on('click', () => (win?.isVisible() ? win.focus() : win?.show()));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open', click: () => { win?.show(); win?.focus(); } },
      { type: 'separator' },
      { label: 'Quit', click: () => { (app as any).isQuitting = true; app.quit(); } },
    ]),
  );
}

app.whenReady().then(async () => {
  await fs.mkdir(mediaDir(), { recursive: true });

  protocol.handle(MEDIA_SCHEME, async (request) => {
    // Host + pathname, so both mission-media://name.jpg and .../name.jpg work.
    const url = new URL(request.url);
    const name = path.basename(decodeURIComponent(url.hostname + url.pathname));
    const file = path.join(mediaDir(), name);
    if (!file.startsWith(mediaDir())) return new Response('denied', { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });

  createWindow();
  createTray();

  // While a session runs, going idle at the machine counts as drifting away.
  setInterval(() => {
    if (!sessionActive || !win) return;
    win.webContents.send('idle-tick', powerMonitor.getSystemIdleTime());
  }, 5000);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('notify', (_e, payload: { title: string; body: string; urgent?: boolean }) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: payload.title,
    body: payload.body,
    urgency: payload.urgent ? 'critical' : 'normal',
  });
  n.on('click', () => { win?.show(); win?.focus(); });
  n.show();
});

ipcMain.handle('set-session-active', (_e, active: boolean) => {
  sessionActive = active;
  tray?.setToolTip(active ? 'Mission Reminder — session running' : 'Mission Reminder');
});

ipcMain.handle('flash', () => {
  // Used when the tree is wilting and the app is not on screen.
  win?.flashFrame(true);
  win?.setAlwaysOnTop(true);
  setTimeout(() => win?.setAlwaysOnTop(false), 4000);
});

ipcMain.handle('show-window', () => { win?.show(); win?.focus(); });

/**
 * Opens a file picker and takes a private copy of whatever was chosen, so the
 * vision board keeps working after the originals are tidied away.
 */
ipcMain.handle('pick-media', async () => {
  if (!win) return [];
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Add to your vision board',
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images and video', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'mp4', 'mov', 'webm'] },
    ],
  });
  if (canceled) return [];

  const out: string[] = [];
  for (const src of filePaths) {
    const name = `${crypto.randomUUID()}${path.extname(src).toLowerCase()}`;
    await fs.copyFile(src, path.join(mediaDir(), name));
    out.push(`${MEDIA_SCHEME}://${name}`);
  }
  return out;
});

/** Raw bytes of a local media file, so it can be uploaded when sync is on. */
ipcMain.handle('read-media', async (_e, url: string) => {
  const name = path.basename(new URL(url).hostname + new URL(url).pathname);
  const file = path.join(mediaDir(), name);
  if (!file.startsWith(mediaDir())) return null;
  const buf = await fs.readFile(file);
  return { bytes: new Uint8Array(buf).buffer, name };
});

ipcMain.handle('open-external', (_e, url: string) => {
  if (/^https?:/i.test(url)) void shell.openExternal(url);
});
