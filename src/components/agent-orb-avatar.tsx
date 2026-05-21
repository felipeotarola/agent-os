'use client';

import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { type CSSProperties, type PointerEvent } from 'react';

import { Icons } from '@/components/icons';

const avatarIcons = {
  cpu: Icons.cpu,
  gitBranch: Icons.gitBranch,
  search: Icons.search,
  sparkles: Icons.sparkles
};

export type AgentAvatarIcon = keyof typeof avatarIcons;

type AgentOrbAvatarProps = {
  name: string;
  icon: AgentAvatarIcon;
  column: string;
};

type OrbStyle = CSSProperties & {
  '--avatar-x': string;
};

export function AgentOrbAvatar({ name, icon: Icon, column }: AgentOrbAvatarProps) {
  const IconComponent = avatarIcons[Icon];
  const lookX = useMotionValue(0);
  const lookY = useMotionValue(0);
  const springX = useSpring(lookX, { stiffness: 170, damping: 26, mass: 0.7 });
  const springY = useSpring(lookY, { stiffness: 170, damping: 26, mass: 0.7 });
  const rotateX = useTransform(springY, [-7, 7], [3, -3]);
  const rotateY = useTransform(springX, [-7, 7], [-3, 3]);

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    lookX.set(Math.max(-1, Math.min(1, x)) * 7);
    lookY.set(Math.max(-1, Math.min(1, y)) * 7);
  }

  function handlePointerLeave() {
    lookX.set(0);
    lookY.set(0);
  }

  const style: OrbStyle = {
    '--avatar-x': column
  };

  return (
    <div
      className='group/orb relative size-16 shrink-0'
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className='absolute inset-0 rounded-full bg-primary/15 blur-md transition-opacity duration-300 group-hover/orb:opacity-80' />
      <div className='absolute inset-[-7px] rounded-full border border-primary/20 border-r-primary/45 border-t-primary/35' />
      <div className='absolute inset-[-3px] rounded-full border border-primary/25 border-r-transparent border-t-transparent transition-transform duration-500 group-hover/orb:rotate-12' />
      <span className='absolute -right-1 top-2 size-1.5 rounded-full bg-primary shadow-sm' />
      <span className='absolute bottom-2 left-0 size-1 rounded-full bg-primary/70 shadow-sm' />
      <div
        role='img'
        aria-label={`${name} avatar`}
        className='relative size-16 overflow-hidden rounded-full border bg-card shadow-sm ring-2 ring-primary/20'
      >
        <motion.div
          className='agent-orb-frame-stage absolute -inset-1 will-change-transform'
          style={{
            ...style,
            x: springX,
            y: springY,
            rotateX,
            rotateY
          }}
          whileHover={{ scale: 1.05, filter: 'brightness(1.06)' }}
          transition={{ type: 'spring', stiffness: 190, damping: 24 }}
        >
          <div className='agent-orb-frame absolute inset-0 bg-[url("/assets/agent-avatars-sprite.png")]' />
        </motion.div>
        <motion.div
          className='absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/50 opacity-0 transition group-hover/orb:opacity-100'
          style={{
            x: springX,
            y: springY
          }}
        />
        <div className='agent-orb-scan absolute inset-x-0 top-1/2 h-px bg-primary/70' />
        <div className='absolute inset-y-0 -left-1/2 w-1/3 rotate-12 bg-primary/20 blur-sm transition-transform duration-700 group-hover/orb:translate-x-32' />
      </div>
      <div className='absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border bg-background text-primary shadow-sm transition-transform duration-200 group-hover/orb:scale-110'>
        <IconComponent className='size-3.5' />
      </div>
      <span className='absolute right-0 top-0 size-3 rounded-full border-2 border-background bg-primary shadow-sm' />
    </div>
  );
}
