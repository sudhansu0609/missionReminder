import { contextBridge, ipcRenderer } from 'electron';

/** What the tray menu needs to know to be useful without opening the window. */
export interface TrayState {
  nextBlock?: { title: string; startMinute: number };
  session?: 'running' | 'paused' | null;
}

export type TrayAction = 'start-next' | 'pause' | 'resume' | 'give-up';

/** The whole native surface the renderer is allowed to touch. */
const api = {
  /**
   * `screen` rides along so a clicked notification lands where the nudge was
   * about, rather than on whatever tab happened to be open.
   */
  notify: (title: string, body: string, urgent = false, screen?: string) =>
    ipcRenderer.invoke('notify', { title, body, urgent, screen }),
  setSessionActive: (active: boolean) => ipcRenderer.invoke('set-session-active', active),
  /** Rebuilds the tray menu. Called whenever the next block or the session changes. */
  setTrayState: (state: TrayState) => ipcRenderer.invoke('set-tray-state', state),
  flash: () => ipcRenderer.invoke('flash'),
  showWindow: () => ipcRenderer.invoke('show-window'),
  /** Returns mission-media:// URLs for the files the user chose. */
  pickMedia: (): Promise<string[]> => ipcRenderer.invoke('pick-media'),
  readMedia: (url: string): Promise<{ bytes: ArrayBuffer; name: string } | null> =>
    ipcRenderer.invoke('read-media', url),
  openExternal: (url: string) => ipcRenderer.invoke('open-external', url),
  onFocusChange: (cb: (focused: boolean) => void) => {
    const h = (_e: unknown, v: boolean) => cb(v);
    ipcRenderer.on('focus-changed', h);
    return () => { ipcRenderer.off('focus-changed', h); };
  },
  /** Seconds the machine has been idle, pushed every 5s during a session. */
  onIdleTick: (cb: (idleSeconds: number) => void) => {
    const h = (_e: unknown, v: number) => cb(v);
    ipcRenderer.on('idle-tick', h);
    return () => { ipcRenderer.off('idle-tick', h); };
  },
  /** A notification was clicked, and it knew which screen it was about. */
  onOpenScreen: (cb: (screen: string) => void) => {
    const h = (_e: unknown, v: string) => cb(v);
    ipcRenderer.on('open-screen', h);
    return () => { ipcRenderer.off('open-screen', h); };
  },
  /** Something was picked from the tray menu. The renderer does the work. */
  onTrayAction: (cb: (action: TrayAction) => void) => {
    const h = (_e: unknown, v: TrayAction) => cb(v);
    ipcRenderer.on('tray-action', h);
    return () => { ipcRenderer.off('tray-action', h); };
  },
};

contextBridge.exposeInMainWorld('mission', api);
export type MissionBridge = typeof api;
