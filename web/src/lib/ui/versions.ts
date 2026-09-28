import type { Status } from '$lib/api/types';
import { t } from './strings';

const space = String.fromCharCode(160);
const dot = String.fromCharCode(183);

export function versionLine(
  site: string,
  status: Pick<Status, 'collector' | 'server'> | null | undefined
): string {
  const parts = [`${t.site.siteVersion}${space}${site}`];
  if (status?.collector.version) {
    parts.push(`${t.site.collectorVersion}${space}${status.collector.version}`);
  }
  if (status?.server.version) parts.push(`${t.site.gameVersion}${space}${status.server.version}`);
  return parts.join(` ${dot} `);
}
