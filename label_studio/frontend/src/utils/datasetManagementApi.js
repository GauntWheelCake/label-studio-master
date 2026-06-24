/**
 * Direct client for the external dataset-management platform.
 *
 * These APIs are called from the browser so that request/response details are
 * visible in the developer tools Network tab. They require the upstream SSO
 * token (including the "Bearer " prefix) and the external platform must allow
 * CORS from the Label Studio origin.
 */

const SSO_TOKEN_KEY = 'label_studio_sso_token';

const MOCK_DICTS = {
  model_class: [
    { label: '\u822a\u7a7a\u822a\u5929', value: '101', id: '101' },
    { label: '\u751f\u547d\u79d1\u5b66', value: '102', id: '102' },
    { label: '\u52a8\u529b\u5b66\u4eff\u771f', value: '103', id: '103' },
    { label: '\u4eba\u5de5\u667a\u80fd', value: '201', id: '201' },
    { label: 'CAE\u524d\u540e\u5904\u7406', value: '301', id: '301' },
    { label: '\u7535\u78c1\u4eff\u771f', value: '302', id: '302' },
    { label: '\u5929\u6c14\u9884\u62a5', value: '303', id: '303' },
    { label: '\u9065\u611f\u6d4b\u7ed8', value: '401', id: '401' },
    { label: '\u534a\u5bfc\u4f53', value: '402', id: '402' },
    { label: '\u56fe\u50cf\u5904\u7406', value: '10001', id: '10001' },
  ],
};

function isSsoDebugMock() {
  return window.APP_SETTINGS?.ssoDebugMock === true || window.APP_SETTINGS?.ssoDebugMock === 'true';
}

function slugify(value) {
  return String(value || 'dataset')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'dataset';
}

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
  if (isSsoDebugMock()) {
    return MOCK_DICTS[dictName] ?? [];
  }

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
  if (isSsoDebugMock()) {
    const dataType = payload?.dataType || 0;
    const name = slugify(payload?.name);

    return {
      id: `mock-dataset-${dataType}-${name}`,
      uploadPrefix: `mock/${dataType}/${name}`,
    };
  }

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
