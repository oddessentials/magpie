import { attempt } from '$lib/ui/load';
import { env } from '$lib/server/env';
import { navigationFor } from '$lib/ui/navigation';
import { serverApi } from '$lib/ui/server';
import type { LayoutServerLoad } from './$types';

const defaultSiteName = 'Dragonwilds server';

export const load: LayoutServerLoad = async ({ fetch, url, cookies }) => {
  const server = serverApi(fetch, url);
  const [status, site] = await Promise.all([
    attempt(server.api.getStatus()),
    attempt(server.api.getSite())
  ]);
  const features = site.ok ? site.data.features : null;
  return {
    siteName: site.ok ? site.data.name : defaultSiteName,
    demo: env.apiMock,
    scenery: cookies.get('magpie-scenery') !== 'off',
    version: site.ok ? site.data.version : null,
    features,
    status: status.ok ? status.data : null,
    statusError: status.ok ? null : status.error,
    streamEnabled: !server.external,
    navigation: navigationFor(features)
  };
};
