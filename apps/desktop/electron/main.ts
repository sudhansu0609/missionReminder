import {
  app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, powerMonitor,
  protocol, net, Tray, Menu, shell,
} from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { leafPng } from './png';
import type { TrayAction, TrayState } from './preload';

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
/**
 * The renderer owns the rules; main only draws them. Everything the tray menu
 * offers is pushed here by the store and sent straight back when clicked, so
 * there is exactly one place that knows what "start the next block" means.
 */
let trayState: TrayState = {};

const showWindow = () => { win?.show(); win?.focus(); };

const formatMinute = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

function sendTrayAction(action: TrayAction) {
  showWindow();
  win?.webContents.send('tray-action', action);
}

function buildTrayMenu() {
  if (!tray) return;
  const next = trayState.nextBlock;
  const running = trayState.session === 'running';
  const paused = trayState.session === 'paused';

  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open', click: showWindow },
      { type: 'separator' },
      {
        label: next
          ? `Start next block: ${next.title} at ${formatMinute(next.startMinute)}`
          : 'Nothing left today',
        enabled: Boolean(next) && !running && !paused,
        click: () => sendTrayAction('start-next'),
      },
      ...(running ? [{ label: 'Pause', click: () => sendTrayAction('pause') }] : []),
      ...(paused ? [{ label: 'Resume', click: () => sendTrayAction('resume') }] : []),
      {
        label: 'Give up',
        enabled: running || paused,
        click: () => sendTrayAction('give-up'),
      },
      { type: 'separator' },
      { label: 'Quit', click: () => { (app as any).isQuitting = true; app.quit(); } },
    ]),
  );
}

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
  buildTrayMenu();
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

ipcMain.handle('notify', (
  _e, payload: { title: string; body: string; urgent?: boolean; screen?: string },
) => {
  if (!Notification.isSupported()) return;
  const n = new Notification({
    title: payload.title,
    body: payload.body,
    urgency: payload.urgent ? 'critical' : 'normal',
  });
  n.on('click', () => {
    showWindow();
    // A reminder about the week that dropped you on Today was half a reminder.
    if (payload.screen) win?.webContents.send('open-screen', payload.screen);
  });
  n.show();
});

ipcMain.handle('set-session-active', (_e, active: boolean) => {
  sessionActive = active;
  tray?.setToolTip(active ? 'Mission Reminder — session running' : 'Mission Reminder');
});

ipcMain.handle('set-tray-state', (_e, next: TrayState) => {
  trayState = next ?? {};
  tray?.setToolTip(
    trayState.session === 'paused' ? 'Mission Reminder — paused'
      : trayState.session === 'running' ? 'Mission Reminder — session running'
        : 'Mission Reminder',
  );
  buildTrayMenu();
});

ipcMain.handle('flash', () => {
  // Used when the tree is wilting and the app is not on screen.
  win?.flashFrame(true);
  win?.setAlwaysOnTop(true);
  setTimeout(() => win?.setAlwaysOnTop(false), 4000);
});

ipcMain.handle('show-window', () => showWindow());

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
