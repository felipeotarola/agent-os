'use client';

import * as React from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { cn } from '@/lib/utils';

function MotionCard({ className, ...props }: React.ComponentProps<typeof motion.div>) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      initial={prefersReducedMotion ? false : { opacity: 0, y: 8, scale: 0.992 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      whileHover={prefersReducedMotion ? undefined : { y: -2 }}
      whileTap={prefersReducedMotion ? undefined : { scale: 0.995 }}
      className={cn(
        'transition-colors will-change-transform hover:border-primary/30 hover:shadow-md',
        'max-md:hover:translate-y-0 max-md:hover:shadow-none',
        className
      )}
      {...props}
    />
  );
}

export { MotionCard };
