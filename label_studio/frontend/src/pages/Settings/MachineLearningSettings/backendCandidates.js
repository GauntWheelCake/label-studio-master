const uniq = (items) => [...new Set(items.filter(Boolean))];

const isLocalHost = (hostname) => ['localhost', '127.0.0.1', '0.0.0.0'].includes(hostname);

export const getDefaultBackendCandidates = (
  backendType = 'image',
  location = window.location,
  appSettings = window.APP_SETTINGS ?? {},
) => {
  const protocol = location?.protocol || 'http:';
  const hostname = location?.hostname || 'localhost';

  if (backendType === 'text') {
    return uniq([appSettings.mlTextHost]);
  }

  const configuredImageHost = appSettings.mlImageHost;
  const configuredLegacyHost = appSettings.mlHost;

  if (isLocalHost(hostname)) {
    return uniq([
      configuredImageHost,
      configuredLegacyHost,
      `${protocol}//127.0.0.1:9091`,
      'http://host.docker.internal:9091',
    ]);
  }

  return uniq([
    configuredImageHost,
    configuredLegacyHost,
    `${protocol}//${hostname}:9000`,
  ]);
};
