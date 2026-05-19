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
        title: 'Knowledge',
        url: '/dashboard/knowledge',
        icon: 'sparkles',
        shortcut: ['k', 'i'],
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
    label: 'System',
    items: [
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
