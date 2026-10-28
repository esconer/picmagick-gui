/**
 * Minimal typing for the Electrobun 2.0.5 main-process SDK.
 *
 * Electrobun 2.x ships its SDK through the Hutch devkit (`.hutch/devkit`)
 * instead of node_modules, so a clean checkout cannot resolve
 * `electrobun/main` until `bunx electrobun prepare` has run. These declarations
 * keep `bun run typecheck` working offline and cover exactly what
 * `src/desktop.ts` uses. Re-check them whenever the `electrobun` version in
 * hutch.config.ts changes.
 */
declare module "electrobun/main" {
  export type WindowOptions = {
    title?: string;
    url?: string | null;
    html?: string | null;
    frame?: { x?: number; y?: number; width: number; height: number };
    hidden?: boolean;
    activate?: boolean;
  };

  export class BrowserView {
    loadURL(url: string): void;
    executeJavascript(js: string): void;
    openDevTools(): void;
  }

  export class BrowserWindow {
    constructor(options?: Partial<WindowOptions>);
    readonly id: number;
    readonly webview: BrowserView;
    setTitle(title: string): void;
    close(): void;
    activate(): void;
    on(event: string, handler: (payload: unknown) => void): void;
  }

  export const PATHS: {
    readonly RESOURCES_FOLDER: string;
    readonly VIEWS_FOLDER: string;
  };

  export const Utils: {
    readonly paths: {
      readonly home: string;
      readonly appData: string;
      readonly config: string;
      readonly cache: string;
      readonly logs: string;
      readonly documents: string;
      readonly downloads: string;
      readonly pictures: string;
      readonly userData: string;
      readonly userCache: string;
      readonly userLogs: string;
    };
    openExternal(url: string): boolean;
  };

  export const BuildConfig: {
    getSync(): { isPackaged: boolean; channel: string };
  };
}
