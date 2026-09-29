import type { SiteFeatures } from '$lib/api/types';
import { t } from './strings';

export interface NavigationEntry {
  label: string;
  href: string;
  group: 'site' | 'admin';
  needs?: (features: SiteFeatures) => boolean;
}

export const navigation: NavigationEntry[] = [
  { label: t.nav.today, href: '/', group: 'site' },
  { label: t.nav.players, href: '/players', group: 'site' },
  { label: t.nav.progression, href: '/progression', group: 'site' },
  { label: t.nav.journal, href: '/journal', group: 'site' },
  { label: t.nav.ledger, href: '/ledger', group: 'site' },
  { label: t.nav.map, href: '/map', group: 'site' },
  { label: t.nav.activity, href: '/activity', group: 'site' },
  { label: t.nav.chat, href: '/chat', group: 'site', needs: (features) => features.chat },
  { label: t.nav.world, href: '/world', group: 'site' },
  { label: t.nav.admin, href: '/admin', group: 'admin' }
];

export interface NavigationLink {
  label: string;
  href: string;
  group: 'site' | 'admin';
}

export function navigationFor(features: SiteFeatures | null): NavigationLink[] {
  return navigation
    .filter((entry) => !features || !entry.needs || entry.needs(features))
    .map(({ label, href, group }) => ({ label, href, group }));
}

export function isCurrent(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
