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
        title: 'Mail Radar',
        url: '/dashboard/mail-radar',
        icon: 'notification',
        shortcut: ['m', 'r'],
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
      },
      {
        title: 'Journal',
        url: '/dashboard/journal',
        icon: 'page',
        shortcut: ['j', 'j'],
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
