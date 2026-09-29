import { appendFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export async function publicationAllowed(env, version, request = fetch) {
  if (env.GITHUB_EVENT_NAME !== 'push' || env.GITHUB_REF_TYPE !== 'tag') return false;
  if (env.GITHUB_REF_NAME !== `v${version}`)
    throw new Error('Release tag must match package.json.');
  if (!env.GITHUB_TOKEN || !env.GITHUB_REPOSITORY) throw new Error('Missing release credentials.');
  const release = await request(
    `https://api.github.com/repos/${env.GITHUB_REPOSITORY}/releases/tags/v${version}`,
    {
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json'
      }
    }
  );
  if (release.status === 200)
    throw new Error('This release already exists; replacement is refused.');
  if (release.status !== 404)
    throw new Error(`Cannot verify release absence: HTTP ${release.status}.`);
  const owner = env.GITHUB_REPOSITORY.split('/')[0].toLowerCase();
  for (const image of ['magpie', 'magpie-collector']) {
    const repository = `${owner}/${image}`;
    const auth = await request(
      `https://ghcr.io/token?service=ghcr.io&scope=repository:${repository}:pull`
    );
    if (!auth.ok) throw new Error(`Cannot check ${image}: HTTP ${auth.status}.`);
    const { token } = await auth.json();
    if (!token) throw new Error(`Missing registry token for ${image}.`);
    const manifest = await request(`https://ghcr.io/v2/${repository}/manifests/${version}`, {
      method: 'HEAD',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept:
          'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json'
      }
    });
    if (manifest.status === 200)
      throw new Error(`${image}:${version} already exists; replacement is refused.`);
    if (manifest.status !== 404)
      throw new Error(`Cannot verify ${image} absence: HTTP ${manifest.status}.`);
  }
  return true;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const publish = await publicationAllowed(process.env, version);
  appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\npublish=${publish}\n`);
  console.log(`Version ${version}; publication ${publish ? 'authorized by tag' : 'disabled'}.`);
}
