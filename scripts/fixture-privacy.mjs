const privatePatterns = [
  [/\b[0-9a-f]{32}\b/, 'an account id'],
  [/\b[0-9A-F]{32}\b/, 'a character or world guid'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/, 'an IP address'],
  [
    /\b(?=[A-Z0-9]{4}-[A-Z0-9]{4}\b)(?:[0-9A-F]*[G-Z]|[0-9A-F]{4}-[0-9A-F]*[G-Z])[A-Z0-9-]*/,
    'a join code'
  ],
  [/\?p=/, 'a login password']
];
const versionKeys = new Set(['version', 'server_version', 'site_version']);

export function privacyProblems(file, document) {
  function publicValues(value, path = []) {
    if (
      file === 'world.json' &&
      path.length === 4 &&
      path[0] === 'save' &&
      path[1] === 'discoveries' &&
      Number.isInteger(path[2]) &&
      path[3] === 'id' &&
      typeof value === 'string' &&
      /^[0-9A-F]{32}$/.test(value)
    )
      return 'public-poi';
    if (Array.isArray(value))
      return value.map((entry, index) => publicValues(entry, [...path, index]));
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([key]) => !versionKeys.has(key))
          .map(([key, entry]) => [key, publicValues(entry, [...path, key])])
      );
    }
    return value;
  }
  const text = JSON.stringify(publicValues(document));
  return privatePatterns.flatMap(([pattern, what]) => {
    const match = pattern.exec(text);
    return match ? [`public fixture contains ${what}: ${match[0]}`] : [];
  });
}
