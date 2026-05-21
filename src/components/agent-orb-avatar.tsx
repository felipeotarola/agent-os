'use client';

import { useState, type CSSProperties, type PointerEvent } from 'react';

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
  '--look-x': string;
  '--look-y': string;
};

export function AgentOrbAvatar({ name, icon: Icon, column }: AgentOrbAvatarProps) {
  const IconComponent = avatarIcons[Icon];
  const [look, setLook] = useState({ x: 0, y: 0 });

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    setLook({
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y))
    });
  }

  const style: OrbStyle = {
    '--avatar-x': column,
    '--look-x': `${look.x * 5}px`,
    '--look-y': `${look.y * 5}px`
  };

  return (
    <div
      className='group/orb agent-orb-idle relative size-16 shrink-0'
      onPointerMove={handlePointerMove}
      onPointerLeave={() => setLook({ x: 0, y: 0 })}
    >
      <div className='absolute inset-0 animate-pulse rounded-full bg-primary/20 blur-md' />
      <div className='agent-orb-ring absolute inset-[-7px] rounded-full border border-primary/15 border-r-primary/45 border-t-primary/35' />
      <div className='absolute inset-[-3px] rounded-full border border-primary/30 border-r-transparent border-t-transparent transition-transform duration-300 group-hover/orb:rotate-45' />
      <span className='agent-orb-particle-a absolute -right-1 top-2 size-1.5 rounded-full bg-primary shadow-sm' />
      <span className='agent-orb-particle-b absolute bottom-2 left-0 size-1 rounded-full bg-primary/70 shadow-sm' />
      <div
        role='img'
        aria-label={`${name} avatar`}
        className='relative size-16 overflow-hidden rounded-full border bg-card shadow-sm ring-2 ring-primary/20'
      >
        <div
          className='agent-orb-frame-stage absolute -inset-1 transition-transform duration-200 ease-out group-hover/orb:scale-105'
          style={{
            ...style,
            transform: 'translate(var(--look-x), var(--look-y))'
          }}
        >
          <div className='agent-orb-frame absolute inset-0 bg-[url("/assets/agent-avatars-sprite.png")]' />
        </div>
        <div
          className='absolute left-1/2 top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/50 opacity-0 transition group-hover/orb:opacity-100'
          style={{
            transform:
              'translate(calc(-50% + var(--look-x)), calc(-50% + var(--look-y))) scale(0.9)'
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
