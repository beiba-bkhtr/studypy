import React, { useCallback, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'motion/react';

import { useAuth } from '../contexts/AuthContext';

interface MagneticButtonProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
}

const SPRING = { stiffness: 150, damping: 15, mass: 0.1 } as const;

/**
 * Button that drifts toward the pointer.
 *
 * The offset is held in motion values rather than React state. The old version
 * called `setState` on every `mousemove`, so each pixel of pointer movement
 * re-rendered the button and everything inside it — noticeable on pages like
 * the arcade, which mounts a dozen of these at once.
 */
export const MagneticButton: React.FC<MagneticButtonProps> = ({
  children,
  className = '',
  onClick,
  disabled = false,
}) => {
  const ref = useRef<HTMLButtonElement>(null);
  const { performanceSettings } = useAuth();

  const x = useSpring(useMotionValue(0), SPRING);
  const y = useSpring(useMotionValue(0), SPRING);

  // Skip the effect entirely where motion is unwanted or expensive.
  const magnetic = !disabled && !performanceSettings.lowPerfMode && !performanceSettings.reducedMotion;

  const handleMouse = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (!magnetic) return;
      const node = ref.current;
      if (!node) return;

      const { height, width, left, top } = node.getBoundingClientRect();
      x.set((e.clientX - (left + width / 2)) * 0.2);
      y.set((e.clientY - (top + height / 2)) * 0.2);
    },
    [magnetic, x, y],
  );

  const reset = useCallback(() => {
    x.set(0);
    y.set(0);
  }, [x, y]);

  return (
    <motion.button
      ref={ref}
      onMouseMove={magnetic ? handleMouse : undefined}
      onMouseLeave={magnetic ? reset : undefined}
      style={{ x, y }}
      className={`${className} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      onClick={!disabled ? onClick : undefined}
      disabled={disabled}
    >
      {children}
    </motion.button>
  );
};
