import React, { useEffect, useRef, useState } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

import { useAuth } from '../contexts/AuthContext';

/**
 * Custom cursor.
 *
 * Previous version had three problems that showed up as input lag:
 *  - the effect listed `isVisible` in its deps, so both window listeners were
 *    torn down and re-attached on the very first mouse move;
 *  - `isTouchDevice` was read in the same tick it was set, so the early return
 *    never fired on the first run and touch devices still attached listeners;
 *  - every `mouseover` ran two `closest()` walks up the DOM synchronously.
 *
 * Detection now happens before paint, listeners attach exactly once, and the
 * hover test is coalesced into a single animation frame.
 */
export const GlowingCursor = () => {
  const { performanceSettings } = useAuth();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springX = useSpring(mouseX, { stiffness: 1000, damping: 50, mass: 0.2 });
  const springY = useSpring(mouseY, { stiffness: 1000, damping: 50, mass: 0.2 });

  const outerSpringX = useSpring(mouseX, { stiffness: 500, damping: 30, mass: 0.5 });
  const outerSpringY = useSpring(mouseY, { stiffness: 500, damping: 30, mass: 0.5 });

  const [isHovering, setIsHovering] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // Resolved synchronously on first render so the effect below can bail out
  // immediately on touch hardware.
  const [isTouchDevice] = useState(
    () =>
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0),
  );

  const disabled = isTouchDevice || performanceSettings.lowPerfMode;

  const rafRef = useRef(0);
  const pendingTarget = useRef<EventTarget | null>(null);

  useEffect(() => {
    if (disabled) return;

    const updateMousePosition = (e: MouseEvent) => {
      mouseX.set(e.clientX);
      mouseY.set(e.clientY);
      // setState only fires once, on the first move.
      setIsVisible(current => (current ? current : true));
    };

    // Resolving the hover target walks the DOM, so do it at most once a frame.
    const flushHover = () => {
      rafRef.current = 0;
      const target = pendingTarget.current;
      pendingTarget.current = null;
      if (!(target instanceof Element)) return;

      const interactive = Boolean(target.closest('button, a, [role="button"]'));
      setIsHovering(current => (current === interactive ? current : interactive));
    };

    const handleMouseOver = (e: MouseEvent) => {
      pendingTarget.current = e.target;
      if (rafRef.current === 0) {
        rafRef.current = requestAnimationFrame(flushHover);
      }
    };

    window.addEventListener('mousemove', updateMousePosition, { passive: true });
    window.addEventListener('mouseover', handleMouseOver, { passive: true });

    return () => {
      window.removeEventListener('mousemove', updateMousePosition);
      window.removeEventListener('mouseover', handleMouseOver);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = 0;
    };
  }, [disabled, mouseX, mouseY]);

  if (disabled || !isVisible) return null;

  return (
    <>
      <motion.div
        className="fixed top-0 left-0 w-8 h-8 rounded-full border-2 border-brand-primary/50 pointer-events-none z-[9999] bg-transparent"
        style={{
          x: outerSpringX,
          y: outerSpringY,
          translateX: '-50%',
          translateY: '-50%',
        }}
        animate={{
          scale: isHovering ? 1.5 : 1,
          backgroundColor: isHovering ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0)',
        }}
        transition={{ type: 'spring', stiffness: 500, damping: 28 }}
      />
      <motion.div
        className="fixed top-0 left-0 w-2 h-2 rounded-full bg-brand-primary pointer-events-none z-[10000] shadow-[0_0_15px_rgba(16,185,129,0.8)]"
        style={{
          x: springX,
          y: springY,
          translateX: '-50%',
          translateY: '-50%',
        }}
      />
    </>
  );
};
