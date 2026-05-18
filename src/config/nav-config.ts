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
        title: 'Tasks',
        url: '/dashboard/kanban',
        icon: 'kanban',
        shortcut: ['t', 't'],
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
        title: 'Affiliate',
        url: '/dashboard/affiliate',
        icon: 'trendingUp',
        shortcut: ['a', 'f'],
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
        title: 'Wiki',
        url: '/dashboard/wiki',
        icon: 'page',
        shortcut: ['w', 'w'],
        items: []
      },
      {
        title: 'Journal',
        url: '/dashboard/journal',
        icon: 'forms',
        shortcut: ['j', 'j'],
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
