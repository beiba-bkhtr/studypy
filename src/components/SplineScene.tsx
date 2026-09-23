import React, { Suspense, useEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';

import { useAuth } from '../contexts/AuthContext';

/**
 * Wrapper around the Spline hero scene.
 *
 * Spline's runtime is by far the heaviest thing the app ships — the WebGL
 * renderer plus its physics/navmesh/font modules total several megabytes. It
 * was imported statically by Layout.tsx, which put it in the entry chunk, so
 * every visitor downloaded and parsed it before the page could become
 * interactive, even on machines that then fell back to the static placeholder.
 *
 * Here it is:
 *   1. code-split behind `React.lazy`, so it is a separate chunk;
 *   2. only imported once the container is actually laid out and on screen;
 *   3. skipped when the device cannot do WebGL at all;
 *   4. skipped in low-performance / reduced-motion mode;
 *   5. wrapped in an error boundary, so a driver or context failure shows the
 *      placeholder instead of tearing down the surrounding tree.
 */
const Spline = React.lazy(() => import('@splinetool/react-spline'));

const SCENE_URL = 'https://prod.spline.design/WlekFpszn0lmLILm/scene.splinecode';

const Placeholder = ({ large = false }: { large?: boolean }) => (
  <div className="w-full h-full bg-gradient-to-br from-brand-primary/20 to-brand-secondary/20 flex items-center justify-center">
    <div className="relative">
      <div className="absolute inset-0 bg-brand-primary/20 rounded-full blur-3xl" />
      <Terminal
        className={`${large ? 'w-32 h-32 md:w-48 md:h-48' : 'w-20 h-20'} text-brand-primary relative z-10 opacity-60`}
      />
    </div>
  </div>
);

/**
 * One-shot WebGL probe.
 *
 * Plenty of real machines cannot give us a context: no GPU, blocklisted
 * drivers, remote desktop sessions, hardware acceleration switched off. The
 * result is cached because creating a throwaway context is not free.
 */
let webglSupport: boolean | null = null;

const supportsWebGL = (): boolean => {
  if (webglSupport !== null) return webglSupport;
  if (typeof document === 'undefined') return false;

  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');

    webglSupport = Boolean(gl);

    // Release the probe context immediately rather than waiting for GC; the
    // browser only allows a small number of live contexts per page.
    const lose = (gl as WebGLRenderingContext | null)?.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  } catch {
    webglSupport = false;
  }

  return webglSupport;
};

interface BoundaryProps {
  fallback: React.ReactNode;
  children: React.ReactNode;
}

/** Contains renderer failures so they never reach the page-level tree. */
class SplineErrorBoundary extends React.Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.warn('Spline scene failed to render, showing static fallback:', error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface SplineSceneProps {
  className?: string;
  /** Larger fallback glyph for the desktop hero panel. */
  large?: boolean;
}

export const SplineScene: React.FC<SplineSceneProps> = ({ className = '', large = false }) => {
  const { performanceSettings } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);
  const [shouldRender, setShouldRender] = useState(false);

  const disabled = performanceSettings.lowPerfMode || performanceSettings.reducedMotion;

  useEffect(() => {
    if (disabled || shouldRender) return;
    if (!supportsWebGL()) return;

    const node = containerRef.current;
    if (!node) return;

    // The hero exists twice in the markup (a mobile and a desktop variant),
    // one of which is always `display: none`. A hidden element reports a
    // zero-size rect at the viewport origin, which an IntersectionObserver
    // happily counts as intersecting — so without this check both variants
    // would boot their own WebGL context.
    const isLaidOut = () => {
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };

    if (typeof IntersectionObserver === 'undefined') {
      if (isLaidOut()) setShouldRender(true);
      return;
    }

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(entry => entry.isIntersecting) && isLaidOut()) {
          setShouldRender(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [disabled, shouldRender]);

  const placeholder = <Placeholder large={large} />;

  return (
    <div ref={containerRef} className="w-full h-full">
      {disabled || !shouldRender ? (
        placeholder
      ) : (
        <SplineErrorBoundary fallback={placeholder}>
          <Suspense fallback={placeholder}>
            <Spline scene={SCENE_URL} className={className} />
          </Suspense>
        </SplineErrorBoundary>
      )}
    </div>
  );
};
