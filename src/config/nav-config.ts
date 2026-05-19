import { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: 'Agent OS',
    items: [
      {
        title: 'Cockpit',
        url: '/dashboard/overview',
        icon: 'dashboard',
        shortcut: ['d', 'd'],
        items: []
      },
      {
        title: 'Inbox Radar',
        url: '/dashboard/radar',
        icon: 'notification',
        shortcut: ['i', 'r'],
        items: []
      },
      {
        title: 'Tasks',
        url: '/dashboard/kanban',
        icon: 'kanban',
        shortcut: ['t', 't'],
        items: []
      },
      {
        title: 'Action Center',
        url: '/dashboard/action-center',
        icon: 'checks',
        shortcut: ['a', 'c'],
        items: []
      },
      {
        title: 'Runway',
        url: '/dashboard/runway',
        icon: 'cash',
        shortcut: ['r', 'w'],
        items: []
      },
      {
        title: 'Agents',
        url: '/dashboard/agents',
        icon: 'teams',
        shortcut: ['a', 'a'],
        items: []
      },
      {
        title: 'Command',
        url: '/dashboard/command',
        icon: 'chat',
        shortcut: ['c', 'c'],
        items: []
      },
      {
        title: 'Chat',
        url: '/dashboard/chat',
        icon: 'send',
        shortcut: ['c', 'h'],
        items: []
      }
    ]
  },
  {
    label: 'Knowledge',
    items: [
      {
        title: 'Knowledge Inbox',
        url: '/dashboard/knowledge',
        icon: 'sparkles',
        shortcut: ['k', 'i'],
        items: []
      },
      {
        title: 'Mail Radar',
        url: '/dashboard/mail-radar',
        icon: 'notification',
        shortcut: ['m', 'r'],
        items: []
      },
      {
        title: 'Supabase',
        url: '/dashboard/supabase',
        icon: 'database',
        shortcut: ['s', 'b'],
        items: []
      },
      {
        title: 'Vercel',
        url: '/dashboard/vercel',
        icon: 'vercel',
        shortcut: ['v', 'v'],
        items: []
      },
      {
        title: 'Wiki',
        url: '/dashboard/wiki',
        icon: 'page',
        shortcut: ['w', 'w'],
        items: []
      },
      {
        title: 'Memory',
        url: '/dashboard/memory',
        icon: 'sparkles',
        shortcut: ['m', 'm'],
        items: []
      }
    ]
  },
  {
    label: 'System',
    items: [
      {
        title: 'Permissions',
        url: '/dashboard/notifications',
        icon: 'lock',
        shortcut: ['p', 'p'],
        items: []
      },
      {
        title: 'Settings',
        url: '/dashboard/settings',
        icon: 'settings',
        shortcut: ['s', 's'],
        items: []
      }
    ]
  }
];
