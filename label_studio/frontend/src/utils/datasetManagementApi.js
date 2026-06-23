/**
 * Direct client for the external dataset-management platform.
 *
 * These APIs are called from the browser so that request/response details are
 * visible in the developer tools Network tab. They require the upstream SSO
 * token (including the "Bearer " prefix) and the external platform must allow
 * CORS from the Label Studio origin.
 */

const SSO_TOKEN_KEY = 'label_studio_sso_token';

/**
 * Normalize the configured SSO host to a full URL prefix.
 *
 * When the platform is placed behind an Nginx reverse proxy, the backend can
 * expose an empty ssoHost so that the browser requests external APIs via
 * relative paths (e.g. /api/v1/fileExplorer/...). This keeps all traffic on the
 * same origin and avoids CORS.
 */
function getSsoHost() {
  const host = window.APP_SETTINGS?.ssoHost;
  if (host === '' || host === null || host === undefined) return '';
  if (host.startsWith('http://') || host.startsWith('https://')) return host;
  return `http://${host}`;
}

/**
 * Persist the SSO token so it survives internal navigation after the token is
 * cleaned from the URL.
 */
export function storeSsoToken(token) {
  if (!token) return;
  try {
    localStorage.setItem(SSO_TOKEN_KEY, token);
  } catch (e) {
    console.warn('Failed to persist SSO token', e);
  }
}

/**
 * Read the SSO token from localStorage or the current URL query string.
 */
export function getSsoToken() {
  try {
    const fromStorage = localStorage.getItem(SSO_TOKEN_KEY);
    if (fromStorage) return fromStorage;
  } catch (e) {
    // ignore
  }

  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('token');
  if (fromUrl) {
    storeSsoToken(fromUrl);
    return fromUrl;
  }

  return null;
}

/**
 * Clear the stored SSO token.
 */
export function clearSsoToken() {
  try {
    localStorage.removeItem(SSO_TOKEN_KEY);
  } catch (e) {
    // ignore
  }
}

async function request(path, { method = 'GET', body } = {}) {
  const token = getSsoToken();
  if (!token) {
    throw new Error('SSO token not found');
  }

  const headers = {
    'Authorization': token.toLowerCase().startsWith('bearer ') ? token : `Bearer ${token}`,
  };
  const init = {
    method,
    headers,
    mode: 'cors',
    credentials: 'omit',
  };

  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const url = `${getSsoHost()}${path}`;
  const response = await fetch(url, init);

  let data;
  try {
    data = await response.json();
  } catch (e) {
    data = null;
  }

  if (!response.ok) {
    const message = data?.msg || data?.message || response.statusText || `HTTP ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.response = data;
    throw err;
  }

  // The external platform returns {code, data, msg, traceId}. Success is
  // indicated by code 0 (e.g. feDatasets) or code 200 (e.g. getUploadUrl).
  if (data && 'code' in data && data.code !== 0 && data.code !== 200) {
    const message = data.msg || `平台返回错误码 ${data.code}`;
    const err = new Error(message);
    err.status = response.status;
    err.response = data;
    throw err;
  }

  return data?.data ?? data;
}

/**
 * Fetch a dictionary from the external SSO platform.
 *
 * @param {string} dictName
 * @returns {Promise<Array<{label: string, value: string, id: string}>>}
 */
export async function getSsoDict(dictName) {
  const payload = await request(`/api/v1/admin/user/dict/${dictName}`);
  const details = payload?.dictDetails || [];
  return details
    .filter(d => d.id != null)
    .map(d => ({
      label: d.label,
      value: String(d.id),
      id: String(d.id),
    }));
}

/**
 * Create a dataset in the external file explorer platform.
 *
 * @param {Object} payload
 * @param {number} payload.dataType
 * @param {string} payload.name
 * @param {string} payload.remark
 * @param {number} payload.type
 */
export async function createFeDataset(payload) {
  return request('/api/v1/fileExplorer/feDatasets', {
    method: 'POST',
    body: payload,
  });
}

/**
 * Fetch presigned upload URLs from the external platform.
 *
 * @param {string} uploadPrefix
 * @param {string[]} fileObjects
 */
export async function getUploadUrls(uploadPrefix, fileObjects) {
  return request('/api/v1/fileExplorer/feDatasets/getUploadUrl', {
    method: 'POST',
    body: { uploadPrefix, fileObjects },
  });
}

/**
 * Upload a single file to a presigned URL.
 *
 * @param {string} url
 * @param {string} contentBase64
 * @param {string} contentType
 */
export async function uploadFileToUrl(url, contentBase64, contentType) {
  const byteCharacters = atob(contentBase64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  const byteArray = new Uint8Array(byteNumbers);
  const blob = new Blob([byteArray], { type: contentType || 'application/octet-stream' });

  const response = await fetch(url, {
    method: 'PUT',
    body: blob,
    mode: 'cors',
    credentials: 'omit',
  });

  if (!response.ok) {
    throw new Error(`文件上传失败: ${response.status} ${response.statusText}`);
  }
}
