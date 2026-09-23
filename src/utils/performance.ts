/**
 * Runtime performance profiling.
 *
 * The app ships a lot of decorative work: backdrop blurs, large blur radii,
 * infinite Motion loops and a WebGL hero scene. All of it is fine on a
 * discrete GPU and miserable on an integrated one. Rather than asking every
 * user to find the toggle in the profile menu, we probe the machine on first
 * load and drop to the cheap rendering path automatically.
 */

export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export const prefersReducedMotion = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
};

/**
 * Static hints available before we render anything. Deliberately conservative:
 * we only claim "low end" when the browser tells us something concrete.
 */
export const detectLowEndDevice = (): boolean => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;

  if (prefersReducedMotion()) return true;

  // Chromium-only, absent elsewhere. `deviceMemory` is GB of RAM, rounded down.
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === 'number' && memory > 0 && memory <= 4) return true;

  const cores = navigator.hardwareConcurrency;
  if (typeof cores === 'number' && cores > 0 && cores <= 4) return true;

  // Save-Data / slow connection: the Spline scene alone is multiple megabytes.
  const connection = (navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (connection?.saveData) return true;
  if (connection?.effectiveType && /(^| )(slow-)?2g|3g/.test(connection.effectiveType)) return true;

  return false;
};

/**
 * Measures real frame pacing for a short window after load and reports the
 * average FPS once. Cheap: one rAF callback per frame doing two numeric ops.
 */
export const probeFrameRate = (
  onResult: (fps: number) => void,
  sampleMs = 2500,
): (() => void) => {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
    return () => {};
  }

  let frames = 0;
  let rafId = 0;
  let cancelled = false;
  let start = 0;

  const tick = (now: number) => {
    if (cancelled) return;
    if (start === 0) start = now;
    frames += 1;

    const elapsed = now - start;
    if (elapsed >= sampleMs) {
      onResult((frames * 1000) / elapsed);
      return;
    }
    rafId = requestAnimationFrame(tick);
  };

  // Let the first paint and lazy chunks settle before sampling, otherwise we
  // measure module evaluation rather than steady-state rendering.
  const timer = window.setTimeout(() => {
    rafId = requestAnimationFrame(tick);
  }, 1200);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (rafId) cancelAnimationFrame(rafId);
  };
};

/** Below this sustained FPS the decorative layers are costing more than they add. */
export const LOW_FPS_THRESHOLD = 45;

/**
 * Mirrors the active tier onto <html> so plain CSS can switch off the
 * expensive effects globally, without every component having to opt in.
 */
export const applyPerfAttributes = (lowPerfMode: boolean): void => {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.dataset.perf = lowPerfMode ? 'low' : 'high';
  root.classList.toggle('low-perf', lowPerfMode);
};
