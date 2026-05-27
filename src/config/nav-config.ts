import { NavGroup } from '@/types';

export const navGroups: NavGroup[] = [
  {
    label: 'Command',
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
        title: 'Action Center',
        url: '/dashboard/action-center',
        icon: 'checks',
        shortcut: ['a', 'c'],
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
        title: 'Content Studio',
        url: '/dashboard/content-studio',
        icon: 'media',
        shortcut: ['c', 's'],
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
      }
    ]
  },
  {
    label: 'Comms',
    items: [
      {
        title: 'Chat',
        url: '/dashboard/chat',
        icon: 'send',
        shortcut: ['c', 'h'],
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
        title: 'Notifications',
        url: '/dashboard/notifications',
        icon: 'notification',
        shortcut: ['n', 'n'],
        items: []
      }
    ]
  },
  {
    label: 'Signals',
    items: [
      {
        title: 'Runway',
        url: '/dashboard/runway',
        icon: 'cash',
        shortcut: ['r', 'w'],
        items: []
      },
      {
        title: 'Trading Lab',
        url: '/dashboard/trading-lab',
        icon: 'dashboard',
        shortcut: ['t', 'l'],
        items: []
      },
      {
        title: 'Sladdis Store',
        url: '/dashboard/affiliate',
        icon: 'product',
        shortcut: ['s', 'l'],
        items: []
      },
      {
        title: 'GitHub',
        url: '/dashboard/github',
        icon: 'github',
        shortcut: ['g', 'h'],
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
        title: 'Supabase',
        url: '/dashboard/supabase',
        icon: 'database',
        shortcut: ['s', 'b'],
        items: []
      }
    ]
  },
  {
    label: 'System',
    items: [
      {
        title: 'Assistant',
        url: '/dashboard/assistant',
        icon: 'sparkles',
        shortcut: ['a', 's'],
        items: []
      },
      {
        title: 'Agents',
        url: '/dashboard/agents',
        icon: 'teams',
        shortcut: ['a', 'g'],
        items: []
      },
      {
        title: 'Topology',
        url: '/dashboard/topology',
        icon: 'database',
        shortcut: ['t', 'p'],
        items: []
      },
      {
        title: 'Architecture',
        url: '/dashboard/architecture',
        icon: 'database',
        shortcut: ['a', 'r'],
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
