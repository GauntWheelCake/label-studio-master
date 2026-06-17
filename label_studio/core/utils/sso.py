"""SSO user info helpers for external platform integration."""
import logging

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


def get_sso_user_info(token):
    """Fetch user info from external SSO platform.

    Args:
        token: Authorization token passed by the upstream platform.

    Returns:
        dict or None: The ``user`` object returned by
        ``/api/v1/admin/auth/userinfo`` when successful, otherwise None.
    """
    if not token:
        return None

    # Local development helper: bypass the external SSO call and return a
    # mock user. Enable by setting SSO_DEBUG_MOCK=true in the environment.
    if getattr(settings, 'SSO_DEBUG_MOCK', False):
        logger.warning('SSO_DEBUG_MOCK is enabled; returning mock user for token %s...', token[:16])
        return _mock_sso_user(token)

    url = getattr(settings, 'SSO_USERINFO_URL', 'http://68.68.18.26:31798/api/v1/admin/auth/userinfo')
    timeout = getattr(settings, 'SSO_USERINFO_TIMEOUT', 5)

    logger.debug('Fetching SSO user info from %s', url)
    try:
        response = requests.get(
            url,
            headers={'Authorization': f'Bearer {token}'},
            timeout=timeout,
        )
        response.raise_for_status()
        data = response.json()

        # The external platform returns the user object directly.
        if isinstance(data, dict) and 'id' in data and 'username' in data:
            return data
        logger.warning(
            'SSO userinfo returned unexpected payload (keys: %s)',
            list(data.keys()) if isinstance(data, dict) else type(data),
        )
    except Exception as exc:
        logger.warning('Failed to fetch SSO user info: %s', exc)

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
    if not token:
        return None

    if getattr(settings, 'SSO_DEBUG_MOCK', False):
        logger.warning('SSO_DEBUG_MOCK is enabled; returning mock dict for %s', dict_name)
        return _mock_sso_dict(dict_name)

    host = getattr(settings, 'SSO_USERINFO_HOST', '68.68.18.26:31798')
    if not host.startswith(('http://', 'https://')):
        host = f'http://{host}'
    url = f'{host}/api/v1/admin/user/dict/{dict_name}'
    timeout = getattr(settings, 'SSO_USERINFO_TIMEOUT', 5)

    logger.debug('Fetching SSO dict from %s', url)
    try:
        response = requests.get(
            url,
            headers={'Authorization': f'Bearer {token}'},
            timeout=timeout,
        )
        response.raise_for_status()
        data = response.json()

        if data.get('code') == 200:
            details = data.get('data', {}).get('dictDetails') or []
            return [{'label': d.get('label'), 'value': str(d.get('value'))} for d in details]
        else:
            logger.warning('SSO dict returned non-200 code: %s', data.get('code'))
    except Exception as exc:
        logger.warning('Failed to fetch SSO dict: %s', exc)

    return None


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
    if not token:
        return None

    if getattr(settings, 'SSO_DEBUG_MOCK', False):
        logger.warning('SSO_DEBUG_MOCK is enabled; returning mock feDataset response')
        return _mock_create_fe_dataset(name, datatype, remark, type)

    host = getattr(settings, 'SSO_USERINFO_HOST', '68.68.18.26:31798')
    if not host.startswith(('http://', 'https://')):
        host = f'http://{host}'
    url = f'{host}/api/v1/fileExplorer/feDatasets'
    timeout = getattr(settings, 'SSO_USERINFO_TIMEOUT', 5)

    payload = {
        'dataType': datatype,
        'name': name,
        'remark': remark,
        'type': type,
    }

    logger.debug('Creating feDataset at %s', url)
    try:
        response = requests.post(
            url,
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
        data = response.json()

        if data.get('code') == 200:
            return data.get('data')
        else:
            logger.warning('feDataset returned non-200 code: %s', data.get('code'))
    except Exception as exc:
        logger.warning('Failed to create feDataset: %s', exc)

    return None


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
    if not token:
        return None

    if getattr(settings, 'SSO_DEBUG_MOCK', False):
        logger.warning('SSO_DEBUG_MOCK is enabled; returning mock upload URLs')
        return _mock_get_upload_urls(upload_prefix, file_objects)

    host = getattr(settings, 'SSO_USERINFO_HOST', '68.68.18.26:31798')
    if not host.startswith(('http://', 'https://')):
        host = f'http://{host}'
    url = f'{host}/api/v1/fileExplorer/feDatasets/getUploadUrl'
    timeout = getattr(settings, 'SSO_USERINFO_TIMEOUT', 5)

    payload = {
        'uploadPrefix': upload_prefix,
        'fileObjects': file_objects,
    }

    logger.debug('Fetching upload URLs from %s', url)
    try:
        response = requests.post(
            url,
            headers={'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'},
            json=payload,
            timeout=timeout,
        )
        response.raise_for_status()
        data = response.json()

        if data.get('code') == 200:
            return data.get('data')
        else:
            logger.warning('getUploadUrl returned non-200 code: %s', data.get('code'))
    except Exception as exc:
        logger.warning('Failed to fetch upload URLs: %s', exc)

    return None


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
    if not token:
        raise Exception('SSO token not found')
    if not upload_prefix:
        raise Exception('Upload prefix not configured for this project')
    if not files:
        return []

    if getattr(settings, 'SSO_DEBUG_MOCK', False):
        logger.warning('SSO_DEBUG_MOCK is enabled; skipping real file uploads')
        return _mock_upload_files_to_dataset(upload_prefix, files)

    file_objects = [file_object for _, file_object in files]
    urls = get_upload_urls(token, upload_prefix, file_objects)
    if urls is None:
        raise Exception('Failed to fetch upload URLs from dataset management')

    uploaded = []
    for abs_path, file_object in files:
        key = f'{upload_prefix}/{file_object}'
        url = urls.get(key)
        if not url:
            raise Exception(f'No upload URL returned for {file_object}')

        logger.debug('Uploading %s to dataset management', file_object)
        with open(abs_path, 'rb') as f:
            put_response = requests.put(url, data=f, timeout=timeout)
            put_response.raise_for_status()
        uploaded.append(file_object)

    return uploaded


def _mock_get_upload_urls(upload_prefix, file_objects):
    """Return deterministic mock upload URLs for local development."""
    return {
        f'{upload_prefix}/{fo}': f'http://localhost/mock-upload/{fo}'
        for fo in file_objects
    }


def _mock_upload_files_to_dataset(upload_prefix, files):
    """Pretend to upload files in local development."""
    return [file_object for _, file_object in files]


def _mock_create_fe_dataset(name, datatype, remark, type):
    """Return a deterministic mock feDataset response for local development."""
    return {
        'id': 12345,
        'dataType': datatype,
        'name': name,
        'remark': remark,
        'type': type,
        'uploadPrefix': 'fe-dataset/12345/1',
    }


def _mock_sso_dict(dict_name):
    """Return deterministic mock dictionary entries for local development."""
    if dict_name == 'model_class':
        return [
            {'label': '航空航天', 'value': '101'},
            {'label': '生命科学', 'value': '102'},
            {'label': '动力学仿真', 'value': '103'},
            {'label': '人工智能', 'value': '201'},
            {'label': 'CAE前后处理', 'value': '301'},
            {'label': '电磁仿真', 'value': '302'},
            {'label': '天气预报', 'value': '303'},
            {'label': '遥感测绘', 'value': '401'},
            {'label': '半导体', 'value': '402'},
            {'label': '图像处理', 'value': '10001'},
        ]
    return []

def _mock_sso_user(token):
    """Return a deterministic mock SSO user for local development."""
    token_hash = str(hash(token) % 100000).zfill(5)
    return {
        'id': int(token_hash),
        'username': f'mock-user-{token_hash}',
        'email': f'mock-user-{token_hash}@localhost',
        'nickName': f'本地测试用户-{token_hash}',
        'enabled': True,
        'userAvatarPath': '',
    }
