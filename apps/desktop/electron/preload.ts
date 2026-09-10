import { contextBridge, ipcRenderer } from 'electron';

/** The whole native surface the renderer is allowed to touch. */
const api = {
  notify: (title: string, body: string, urgent = false) =>
    ipcRenderer.invoke('notify', { title, body, urgent }),
  setSessionActive: (active: boolean) => ipcRenderer.invoke('set-session-active', active),
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
};

contextBridge.exposeInMainWorld('mission', api);
export type MissionBridge = typeof api;
