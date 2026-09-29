import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { requireAdmin, requireSameOrigin } from '../auth/admin';
import { getDb, type Database } from '../db/client';
import { featureLabels, siteFeatures, type FeatureName } from '../settings';
import { guarded, notFound, privateJson, publicJson } from './respond';

export function clientAddress(event: Pick<RequestEvent, 'getClientAddress'>): string {
  try {
    return event.getClientAddress();
  } catch {
    return 'unknown';
  }
}

export function publicGet(
  handler: (event: RequestEvent, db: Database) => Promise<unknown>
): RequestHandler {
  return (event) => guarded(async () => publicJson(await handler(event, getDb()), event.request));
}

export function adminGet(
  handler: (event: RequestEvent, db: Database) => Promise<unknown>
): RequestHandler {
  return (event) =>
    guarded(async () => {
      await requireAdmin(event);
      return privateJson(await handler(event, getDb()));
    });
}

export function adminMutation(
  handler: (event: RequestEvent, db: Database) => Promise<Response>
): RequestHandler {
  return (event) =>
    guarded(async () => {
      await requireAdmin(event);
      requireSameOrigin(event);
      return handler(event, getDb());
    });
}

export async function requireFeature(name: FeatureName, db: Database = getDb()): Promise<void> {
  if (!(await siteFeatures(db))[name]) {
    throw notFound(`${featureLabels[name]} is switched off on this site`);
  }
}

export async function readJsonBody(event: RequestEvent): Promise<unknown> {
  try {
    return await event.request.json();
  } catch {
    return undefined;
  }
}
