import type { MissionBridge } from '../electron/preload';

declare global {
  interface Window {
    /** Absent when the renderer is opened in a plain browser. */
    mission?: MissionBridge;
  }
}
export {};
