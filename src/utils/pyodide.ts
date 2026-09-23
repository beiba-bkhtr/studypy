/**
 * Lazy loader for the Pyodide runtime.
 *
 * Pyodide is several megabytes of WebAssembly. It used to be pulled in by a
 * blocking <script> in index.html, so every visitor paid for it even on pages
 * that never run Python. It is now fetched on first use and shared through a
 * single in-flight promise.
 */

const PYODIDE_VERSION = 'v0.26.4';
const PYODIDE_INDEX_URL = `https://cdn.jsdelivr.net/pyodide/${PYODIDE_VERSION}/full/`;
const PYODIDE_SCRIPT_URL = `${PYODIDE_INDEX_URL}pyodide.js`;

type PyodideWindow = Window & {
  pyodide?: any;
  loadPyodide?: (options: { indexURL: string }) => Promise<any>;
};

let pyodideLoadPromise: Promise<any> | null = null;

const injectScript = (): Promise<void> =>
  new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-pyodide-runtime]');

    if (existing) {
      // A previous call already queued the download; piggyback on it.
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('pyodide script failed')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.dataset.pyodideRuntime = 'true';
    script.src = PYODIDE_SCRIPT_URL;
    script.async = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error('pyodide script failed')), { once: true });
    document.body.appendChild(script);
  });

export const loadPyodideRuntime = (): Promise<any> => {
  const win = window as PyodideWindow;
  if (win.pyodide) return Promise.resolve(win.pyodide);
  if (pyodideLoadPromise) return pyodideLoadPromise;

  pyodideLoadPromise = (async () => {
    try {
      if (!win.loadPyodide) await injectScript();
      if (!win.loadPyodide) throw new Error('loadPyodide missing after script load');

      const py = await win.loadPyodide({ indexURL: PYODIDE_INDEX_URL });
      win.pyodide = py;
      return py;
    } catch (error) {
      // Allow a retry on the next call rather than caching the failure.
      pyodideLoadPromise = null;
      throw new Error('Не удалось загрузить среду Python. Проверьте подключение к интернету.');
    }
  })();

  return pyodideLoadPromise;
};

/** True once the runtime is ready, without triggering a download. */
export const isPyodideReady = (): boolean => Boolean((window as PyodideWindow).pyodide);
