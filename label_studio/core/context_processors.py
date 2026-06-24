"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
from django.conf import settings as django_settings

from core.utils.common import collect_versions


def _sso_user_settings(sso_user):
    """Map external SSO user payload to frontend user settings."""
    nick_name = sso_user.get('nickName', '') or sso_user.get('username', '')
    username = sso_user.get('username', '')
    email = sso_user.get('email', '')

    if nick_name:
        initials = nick_name[0]
    elif username:
        initials = username[0]
    elif email:
        initials = email[0]
    else:
        initials = ''

    return {
        'id': str(sso_user.get('id', '')) if sso_user.get('id') is not None else '',
        'username': username,
        'firstName': nick_name,
        'lastName': '',
        'initials': initials,
        'email': email,
        'avatar': sso_user.get('userAvatarPath', '') or '',
    }


def _django_user_settings(user):
    """Build user settings from Django request.user."""
    settings = {
        'id': str(user.id) if getattr(user, 'id', None) is not None else '',
        'username': getattr(user, 'username', ''),
        'firstName': getattr(user, 'first_name', ''),
        'lastName': getattr(user, 'last_name', ''),
        'initials': user.get_initials() if hasattr(user, 'get_initials') else '',
        'email': getattr(user, 'email', ''),
    }

    if getattr(user, 'avatar', None) and hasattr(user, 'avatar_url'):
        settings['avatar'] = user.avatar_url

    return settings


def sentry_fe(request):
    # return the value you want as a dictionary, you may add multiple values in there
    return {
        'SENTRY_FE': django_settings.SENTRY_FE
    }


def settings(request):
    """ Make available django settings on each template page
    """
    versions = collect_versions()

    # django templates can't access names with hyphens
    versions['lsf'] = versions.get('label-studio-frontend', {})
    versions['lsf']['commit'] = versions['lsf'].get('commit', 'none')[0:6]

    versions['backend'] = {}
    if 'label-studio-os-backend' in versions:
        versions['backend']['commit'] = versions['label-studio-os-backend'].get('commit', 'none')[0:6]
    if 'label-studio-enterprise-backend' in versions:
        versions['backend']['commit'] = versions['label-studio-enterprise-backend'].get('commit', 'none')[0:6]

    if 'dm2' in versions:
        versions['dm2']['commit'] = versions['dm2'].get('commit', 'none')[0:6]

    # SSO middleware validates the URL token and stores the user in session.
    # Context processor only reads the cached user for rendering.
    sso_user = request.session.get('sso_user')
    if sso_user:
        user_settings = _sso_user_settings(sso_user)
    else:
        user_settings = _django_user_settings(request.user)

    # Frontend dataset-management APIs can be served through a reverse proxy on
    # the same origin. In that case SSO_DATASET_API_HOST should be empty so the
    # browser uses relative URLs. It defaults to the SSO userinfo host.
    sso_host = getattr(
        django_settings, 'SSO_DATASET_API_HOST', django_settings.SSO_USERINFO_HOST
    )
    if sso_host and not sso_host.startswith(('http://', 'https://')):
        sso_host = f'http://{sso_host}'

    # Expose current user's API token so the frontend can store it in
    # sessionStorage for ML backend integration.
    user_token = ''
    if hasattr(request.user, 'auth_token'):
        try:
            user_token = request.user.auth_token.key
        except Exception:
            pass

    app_settings = {
        'user': user_settings,
        'debug': django_settings.DEBUG,
        'hostname': django_settings.HOSTNAME,
        'ssoHost': sso_host,
        'ssoDebugMock': django_settings.SSO_DEBUG_MOCK,
        'mlHost': getattr(django_settings, 'ML_HOST', ''),
        'mlImageHost': getattr(django_settings, 'ML_IMAGE_HOST', ''),
        'mlTextHost': getattr(django_settings, 'ML_TEXT_HOST', ''),
        'sharedAdminMode': django_settings.ENABLE_SHARED_ADMIN_MODE,
        'userToken': user_token,
        'version': versions,
    }

    return {
        'settings': django_settings,
        'versions': versions,
        'app_settings': app_settings,
    }
