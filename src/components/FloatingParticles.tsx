import React, { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface FloatingParticlesProps {
  color?: string;
  count?: number;
}

/**
 * Ambient drifting dots.
 *
 * Each particle used to be a `motion.div` running its own infinite JS-driven
 * animation, which means Motion ticks every one of them on the main thread on
 * every frame. They are now plain elements driven by a single CSS keyframe
 * (`animate-float-drift`), so the whole effect runs on the compositor and
 * costs essentially nothing on the main thread.
 */
export const FloatingParticles: React.FC<FloatingParticlesProps> = React.memo(({
  color = 'rgba(255, 255, 255, 0.5)',
  count = 20,
}) => {
  const { performanceSettings } = useAuth();

  const particles = useMemo(() => {
    const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
    const finalCount = isMobile ? Math.floor(count / 2) : count;

    return Array.from({ length: finalCount }, (_, i) => ({
      id: i,
      size: Math.random() * 10 + 5,
      left: `${Math.random() * 100}%`,
      top: `${Math.random() * 100}%`,
      opacity: Math.random() * 0.2 + 0.1,
      duration: `${Math.random() * 10 + 10}s`,
      driftX: `${Math.random() * 50 - 25}px`,
      delay: `${Math.random() * 5}s`,
    }));
  }, [count]);

  if (performanceSettings.lowPerfMode || performanceSettings.reducedMotion) return null;

  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0" aria-hidden="true">
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full animate-float-drift"
          style={{
            width: p.size,
            height: p.size,
            backgroundColor: color,
            left: p.left,
            top: p.top,
            opacity: p.opacity,
            // Consumed by the `float-drift` keyframes in index.css.
            ['--drift-x' as string]: p.driftX,
            ['--drift-duration' as string]: p.duration,
            ['--drift-delay' as string]: p.delay,
          }}
        />
      ))}
    </div>
  );
});

FloatingParticles.displayName = 'FloatingParticles';
