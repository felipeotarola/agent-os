'use client';

import { useMemo } from 'react';
import type { NavGroup, NavItem } from '@/types';

/**
 * V0 cockpit navigation: show all items when Clerk/RBAC is not configured.
 * Page-level protection can come back once Agent OS has real auth requirements.
 */
export function useFilteredNavItems(items: NavItem[]) {
  return useMemo(() => items, [items]);
}

export function useFilteredNavGroups(groups: NavGroup[]) {
  return useMemo(() => groups.filter((group) => group.items.length > 0), [groups]);
}
