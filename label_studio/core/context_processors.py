"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
from django.conf import settings as django_settings
from core.utils.common import collect_versions


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

    user = request.user
    user_settings = {
        'id': str(user.id) if getattr(user, 'id', None) is not None else '',
        'username': getattr(user, 'username', ''),
        'firstName': getattr(user, 'first_name', ''),
        'lastName': getattr(user, 'last_name', ''),
        'initials': user.get_initials() if hasattr(user, 'get_initials') else '',
        'email': getattr(user, 'email', ''),
    }

    if getattr(user, 'avatar', None) and hasattr(user, 'avatar_url'):
        user_settings['avatar'] = user.avatar_url

    app_settings = {
        'user': user_settings,
        'debug': django_settings.DEBUG,
        'hostname': django_settings.HOSTNAME,
        'sharedAdminMode': django_settings.ENABLE_SHARED_ADMIN_MODE,
        'version': versions,
    }

    return {
        'settings': django_settings,
        'versions': versions,
        'app_settings': app_settings,
    }
