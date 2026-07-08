"""SSO user info helpers for external platform integration."""
import hashlib
import logging

import requests
from django.conf import settings
from django.core.exceptions import ImproperlyConfigured

logger = logging.getLogger(__name__)


def _sso_base_url():
    """Return the normalized SSO host URL prefix."""
    host = settings.SSO_USERINFO_HOST
    if not host:
        raise ImproperlyConfigured(
            'SSO_USERINFO_HOST environment variable must be set. '
            'Example: SSO_USERINFO_HOST=68.68.18.26:31798'
        )
    if not host.startswith(('http://', 'https://')):
        host = f'http://{host}'
    return host


def get_sso_user_info(token):
    """Fetch user info from external SSO platform.

    Args:
        token: Authorization token passed by the upstream platform.

    Returns:
        dict or None: The ``user`` object returned by
        ``/api/v1/admin/auth/userinfo`` when successful, otherwise None.
    """
    if not token or not str(token).strip():
        return None

    token = str(token).strip()

    # Local development helper: bypass the external SSO call and return a
    # mock user. Enable by setting SSO_DEBUG_MOCK=true in the environment.
    if getattr(settings, 'SSO_DEBUG_MOCK', False):
        logger.warning('SSO_DEBUG_MOCK is enabled; returning mock user for token %s...', token[:16])
        return _mock_sso_user(token)

    url = f'{_sso_base_url()}/api/v1/admin/auth/userinfo'
    timeout = getattr(settings, 'SSO_USERINFO_TIMEOUT', 5)

    logger.debug('Fetching SSO user info from %s', url)
    try:
        response = requests.get(
            url,
            headers={'Authorization': token if token.lower().startswith('bearer ') else f'Bearer {token}'},
            timeout=timeout,
        )
        response.raise_for_status()
        data = response.json()

        # The external platform may return the user object directly, or wrap it
        # in a standard envelope like {"code": 200, "data": {...}, "msg": ...}.
        if isinstance(data, dict) and 'code' in data:
            if data.get('code') == 200:
                payload = data.get('data')
            else:
                logger.warning(
                    'SSO userinfo returned error code %s: %s (traceId: %s)',
                    data.get('code'), data.get('msg'), data.get('traceId'),
                )
                return None
        else:
            payload = data

        if isinstance(payload, dict) and payload.get('username'):
            return payload
        logger.warning(
            'SSO userinfo returned unexpected payload (keys: %s): %s',
            list(payload.keys()) if isinstance(payload, dict) else type(payload),
            payload,
        )
    except Exception as exc:
        logger.warning('Failed to fetch SSO user info: %s', exc)

    return None


def _sso_api_call(method, path, token, payload=None, timeout=None):
    """Make an authenticated JSON request to the external SSO platform.

    Args:
        method: HTTP method (e.g. 'GET', 'POST').
        path: API path appended to the configured SSO host.
        token: Authorization token passed by the upstream platform.
        payload: Optional JSON-serializable request body.
        timeout: Optional request timeout in seconds.

    Returns:
        The ``data`` field of the JSON response when the platform reports
        success, otherwise ``None``. Success is indicated by ``code`` ``0`` or
        ``200`` depending on the endpoint.
    """
    if not token or not str(token).strip():
        return None

    token = str(token).strip()
    url = f'{_sso_base_url()}{path}'
    timeout = timeout or getattr(settings, 'SSO_USERINFO_TIMEOUT', 5)
    headers = {'Authorization': token if token.lower().startswith('bearer ') else f'Bearer {token}'}
    kwargs = {'headers': headers, 'timeout': timeout}
    if payload is not None:
        headers['Content-Type'] = 'application/json'
        kwargs['json'] = payload

    logger.debug('SSO %s %s payload=%s', method, url, payload)
    try:
        response = requests.request(method, url, **kwargs)
        logger.debug('SSO %s status=%s body=%s', url, response.status_code, response.text[:500])
        response.raise_for_status()
        data = response.json()
        logger.debug('SSO %s response: %s', path, data)
        # Dataset-management endpoints use code 0 for success; other endpoints
        # such as getUploadUrl use code 200.
        if data.get('code') in (0, 200):
            return data.get('data')
        logger.warning('%s returned non-success code: %s, msg: %s', path, data.get('code'), data.get('msg'))
    except Exception as exc:
        logger.warning('Failed SSO %s request to %s: %s', method, url, exc)

    return None


def get_sso_dict(token, dict_name='model_class'):
    """Fetch a dictionary from the external SSO platform.

    Args:
        token: Authorization token passed by the upstream platform.
        dict_name: Name of the dictionary to fetch.

    Returns:
        list or None: A list of ``dictDetails`` entries with ``label`` and
        ``value`` when successful, otherwise None.
    """
    if getattr(settings, 'SSO_DEBUG_MOCK', False):
        logger.warning('SSO_DEBUG_MOCK is enabled; returning mock dict for %s', dict_name)
        return _mock_sso_dict(dict_name)

    data = _sso_api_call('GET', f'/api/v1/admin/user/dict/{dict_name}', token)
    if data is None:
        return None
    details = data.get('dictDetails') or []
    # The external platform exposes both "id" and "value" for each dict entry.
    # For model_class the caller must use "id" as the dataType when creating a
    # dataset, so expose it as the option value.
    return [
        {'label': d.get('label'), 'value': str(d.get('id')), 'id': str(d.get('id'))}
        for d in details
        if d.get('id') is not None
    ]


def create_fe_dataset(token, name, datatype, remark='', type=0):
    """Create a dataset entry in the external file explorer platform.

    Args:
        token: Authorization token passed by the upstream platform.
        name: Dataset name (project title).
        datatype: Dataset datatype (model classification value).
        remark: Optional dataset remark (project description).
        type: Dataset type, defaults to 0.

    Returns:
        dict or None: The created dataset payload returned by the external
        platform when successful, otherwise None.
    """
    payload = {
        'dataType': int(datatype) if datatype else 0,
        'name': name,
        'remark': remark,
        'type': int(type),
    }
    return _sso_api_call('POST', '/api/v1/fileExplorer/feDatasets', token, payload)


def get_upload_urls(token, upload_prefix, file_objects):
    """Fetch presigned upload URLs from the external file explorer platform.

    Args:
        token: Authorization token passed by the upstream platform.
        upload_prefix: The uploadPrefix returned by create_fe_dataset.
        file_objects: List of relative file paths, e.g. ['train/result.json'].

    Returns:
        dict or None: Mapping from full object key to presigned URL, or None
        when the request fails.
    """
    payload = {
        'uploadPrefix': upload_prefix,
        'fileObjects': file_objects,
    }
    urls = _sso_api_call('POST', '/api/v1/fileExplorer/feDatasets/getUploadUrl', token, payload)
    logger.info('get_upload_urls returned keys: %s', list(urls.keys()) if urls else None)
    return urls


def upload_files_to_dataset(token, upload_prefix, files, timeout=30):
    """Upload local files to the external dataset management storage.

    Args:
        token: Authorization token passed by the upstream platform.
        upload_prefix: The uploadPrefix returned by create_fe_dataset.
        files: List of (absolute_path, file_object) tuples, where file_object
            is the relative path used in the dataset, e.g. 'train/result.json'.
        timeout: Timeout in seconds for each PUT request.

    Returns:
        list: The list of uploaded file_objects.

    Raises:
        Exception: If fetching upload URLs fails or any PUT upload fails.
    """
    if not token or not str(token).strip():
        raise Exception('SSO token not found')

    token = str(token).strip()

    if not upload_prefix:
        raise Exception('Upload prefix not configured for this project')
    if not files:
        return []

    file_objects = [file_object for _, file_object in files]
    urls = get_upload_urls(token, upload_prefix, file_objects)
    if urls is None:
        raise Exception('Failed to fetch upload URLs from dataset management')

    logger.info('upload_files_to_dataset looking for keys: %s', [f'{upload_prefix}/{fo}' for fo in file_objects])
    logger.info('upload_files_to_dataset available keys: %s', list(urls.keys()))

    uploaded = []
    for abs_path, file_object in files:
        # Try full key first, then fallback to file_object alone in case the
        # platform returns URLs keyed by relative path only.
        keys_to_try = [
            f'{upload_prefix}/{file_object}',
            file_object,
            f'{upload_prefix}{file_object}' if not upload_prefix.endswith('/') else f'{upload_prefix}{file_object.lstrip("/")}',
        ]
        url = None
        for key in keys_to_try:
            if key in urls:
                url = urls[key]
                break
        if not url:
            raise Exception(f'No upload URL returned for {file_object} (tried keys: {keys_to_try})')

        logger.debug('Uploading %s to dataset management', file_object)
        with open(abs_path, 'rb') as f:
            put_response = requests.put(url, data=f, timeout=timeout)
            put_response.raise_for_status()
        uploaded.append(file_object)

    return uploaded


def _mock_sso_dict(dict_name):
    """Return deterministic mock dictionary entries for local development."""
    if dict_name == 'model_class':
        return [
            {'label': '航空航天', 'id': '101', 'value': '101'},
            {'label': '生命科学', 'id': '102', 'value': '102'},
            {'label': '动力学仿真', 'id': '103', 'value': '103'},
            {'label': '人工智能', 'id': '201', 'value': '201'},
            {'label': 'CAE前后处理', 'id': '301', 'value': '301'},
            {'label': '电磁仿真', 'id': '302', 'value': '302'},
            {'label': '天气预报', 'id': '303', 'value': '303'},
            {'label': '遥感测绘', 'id': '401', 'value': '401'},
            {'label': '半导体', 'id': '402', 'value': '402'},
            {'label': '图像处理', 'id': '10001', 'value': '10001'},
        ]
    return []


def _mock_sso_user(token):
    """Return a deterministic mock SSO user for local development."""
    token_digest = hashlib.sha256(str(token).encode('utf-8')).hexdigest()
    token_hash = str(int(token_digest, 16) % 100000).zfill(5)
    username = getattr(settings, 'SSO_MOCK_USERNAME', '') or f'mock-user-{token_hash}'

    return {
        'id': getattr(settings, 'SSO_MOCK_USER_ID', '') or int(token_hash),
        'username': username,
        'email': getattr(settings, 'SSO_MOCK_EMAIL', '') or f'{username}@localhost',
        'nickName': getattr(settings, 'SSO_MOCK_NICKNAME', '') or f'Local Test User {token_hash}',
        'enabled': True,
        'userAvatarPath': getattr(settings, 'SSO_MOCK_AVATAR', '') or '',
    }
