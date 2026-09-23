import React, { useMemo, useRef } from 'react';
import { motion, useInView, Variants } from 'motion/react';

import { useAuth } from '../contexts/AuthContext';

interface TextRevealProps {
  text: string;
  className?: string;
  delay?: number;
}

const container: Variants = {
  hidden: { opacity: 0 },
  visible: (delay: number) => ({
    opacity: 1,
    transition: {
      staggerChildren: 0.03,
      delayChildren: delay,
      duration: 0.1,
    },
  }),
};

/*
 * Only `opacity` and `y` are animated here.
 *
 * The original also animated `filter: blur(4px) -> blur(0px)` on every word.
 * A blur filter cannot be handled by the compositor, so each frame forced the
 * text to be re-rasterised — on headings split into a dozen words, on a dozen
 * pages. Dropping it is visually near-identical and removes the cost.
 */
const child: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
};

export const TextReveal: React.FC<TextRevealProps> = React.memo(({
  text,
  className = '',
  delay = 0,
}) => {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-5%' });
  const { performanceSettings } = useAuth();

  const words = useMemo(() => text.split(' '), [text]);

  // Render the finished state directly when motion is unwanted: no Motion
  // subscriptions, no stagger timers, no per-word elements to animate.
  if (performanceSettings.reducedMotion || performanceSettings.lowPerfMode) {
    return <span className={`inline ${className}`}>{text}</span>;
  }

  return (
    <motion.span
      ref={ref}
      className={`inline ${className}`}
      variants={container}
      custom={delay}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
    >
      {words.map((word, index) => (
        <motion.span
          variants={child}
          key={`${word}-${index}`}
          className={`inline-block ${className}`}
        >
          {word}
          {index < words.length - 1 && '\u00A0'}
        </motion.span>
      ))}
    </motion.span>
  );
});

TextReveal.displayName = 'TextReveal';
