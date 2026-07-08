"""This file and its contents are licensed under the Apache License 2.0. Please see the included NOTICE for copyright information and LICENSE for a copy of the license.
"""
import json
import time

from uuid import uuid4
from django.contrib import auth
from django.contrib.auth import get_user_model, login
from django.http import HttpResponsePermanentRedirect, HttpResponseRedirect
from rest_framework.authtoken.models import Token
from django.utils.deprecation import MiddlewareMixin
from django.core.handlers.base import BaseHandler
from django.core.exceptions import ImproperlyConfigured, MiddlewareNotUsed
from django.middleware.common import CommonMiddleware
from django.conf import settings
from django.utils import timezone
from django.utils.http import escape_leading_slashes
from rest_framework.permissions import SAFE_METHODS
from rest_framework.response import Response
from core.utils.contextlog import ContextLog
from core.utils.sso import get_sso_user_info

import logging

logger = logging.getLogger(__name__)


class DisableCSRF(MiddlewareMixin):
    def process_request(self, request):
        setattr(request, '_dont_enforce_csrf_checks', True)


class SharedAdminAutoLoginMiddleware(MiddlewareMixin):
    def process_request(self, request):
        if not settings.ENABLE_SHARED_ADMIN_MODE:
            return

        shared_user = self._get_or_create_shared_user()
        current_user = request.user

        if not current_user.is_authenticated or current_user.id != shared_user.id:
            auth.login(request, shared_user, backend='django.contrib.auth.backends.ModelBackend')

        self._ensure_fixed_token(shared_user)
        self._ensure_organization_context(shared_user, request)

    def _get_or_create_shared_user(self):
        User = get_user_model()
        defaults = {
            'username': settings.SHARED_ADMIN_USERNAME,
            'is_staff': True,
            'is_superuser': True,
            'is_active': True,
        }
        shared_user, _ = User.objects.get_or_create(email=settings.SHARED_ADMIN_EMAIL, defaults=defaults)

        fields_to_update = []
        if shared_user.username != settings.SHARED_ADMIN_USERNAME:
            shared_user.username = settings.SHARED_ADMIN_USERNAME
            fields_to_update.append('username')
        if not shared_user.is_staff:
            shared_user.is_staff = True
            fields_to_update.append('is_staff')
        if not shared_user.is_superuser:
            shared_user.is_superuser = True
            fields_to_update.append('is_superuser')
        if not shared_user.is_active:
            shared_user.is_active = True
            fields_to_update.append('is_active')
        if not shared_user.has_usable_password():
            pass
        else:
            shared_user.set_unusable_password()
            fields_to_update.append('password')

        if fields_to_update:
            shared_user.save(update_fields=fields_to_update)

        return shared_user

    def _ensure_fixed_token(self, user):
        fixed_token = (settings.SHARED_ADMIN_FIXED_TOKEN or '').strip()
        if not fixed_token:
            return

        if len(fixed_token) > 40:
            raise ValueError('SHARED_ADMIN_FIXED_TOKEN length must be <= 40 characters.')

        token, _ = Token.objects.get_or_create(user=user)
        if token.key == fixed_token:
            return

        Token.objects.filter(key=fixed_token).exclude(user=user).delete()
        Token.objects.filter(user=user).delete()
        Token.objects.create(user=user, key=fixed_token)

    def _ensure_organization_context(self, user, request):
        from organizations.models import Organization

        organization = Organization.objects.first()
        if organization is None:
            organization = Organization.create_organization(
                created_by=user,
                title=settings.SHARED_ORGANIZATION_TITLE,
            )

        if not organization.has_user(user):
            organization.add_user(user)

        if user.active_organization_id != organization.id:
            user.active_organization = organization
            user.save(update_fields=['active_organization'])

        request.session['organization_pk'] = organization.id


class SSOAuthMiddleware(MiddlewareMixin):
    """Authenticate users via external SSO token and create isolated accounts.

    - URL contains ?token=xxx: validate token, create/get Label Studio user,
      create/get user's private organization, and log the user in.
    - No token but session has cached sso_user: log the cached user back in.
    - No token and no session: redirect to the SSO platform for login.
    - Invalid/expired token: clear session and redirect to SSO platform.
    """

    # Paths that should never be redirected to the SSO login page.
    EXEMPT_PATH_PREFIXES = (
        '/static/', '/media/', '/data/', '/api/', '/admin/',
        '/django-rq/', '/swagger/', '/redoc/', '/health',
    )

    def process_request(self, request):
        token = self._extract_token(request)
        has_session_user = bool(request.session.get('sso_user'))

        logger.warning(
            '[SSOAuthMiddleware] path=%s token=%s(%s) session_user=%s mock=%s',
            request.path_info,
            'present' if token else 'absent',
            self._mask_token(token),
            'present' if has_session_user else 'absent',
            getattr(settings, 'SSO_DEBUG_MOCK', False),
        )

        if token:
            sso_user = get_sso_user_info(token)
            effective_token = token
            used_workaround = False

            # Workaround: some upstream platforms put raw JWT in the URL query
            # string without URL-encoding '+' characters. Django decodes '+' as
            # space, which corrupts the token. Retry with spaces replaced by '+'.
            if not sso_user and ' ' in token:
                logger.warning('[SSOAuthMiddleware] retrying token with spaces-as-plus workaround')
                effective_token = token.replace(' ', '+')
                used_workaround = True
                sso_user = get_sso_user_info(effective_token)

            if sso_user:
                logger.warning('[SSOAuthMiddleware] token valid, user=%s workaround=%s', sso_user.get('username'), used_workaround)
                user = self._get_or_create_sso_user(sso_user)
                self._ensure_sso_organization(user, request)
                request.session['sso_token'] = effective_token
                request.session['sso_user'] = sso_user
                self._login_user(request, user)
                return

            logger.warning('[SSOAuthMiddleware] token invalid/expired, redirecting to SSO')
            self._clear_sso_session(request)
            return HttpResponseRedirect(self._sso_host())

        # No token in URL, but we have a cached SSO user in session.
        sso_user = request.session.get('sso_user')
        if sso_user:
            if getattr(settings, 'SSO_DEBUG_MOCK', False):
                effective_token = request.session.get('sso_token') or self._mock_token()
                refreshed_sso_user = get_sso_user_info(effective_token)
                if refreshed_sso_user:
                    request.session['sso_token'] = effective_token
                    request.session['sso_user'] = refreshed_sso_user
                    sso_user = refreshed_sso_user
            logger.warning('[SSOAuthMiddleware] restoring user from session=%s', sso_user.get('username'))
            user = self._get_or_create_sso_user(sso_user)
            self._ensure_sso_organization(user, request)
            self._login_user(request, user)
            return

        # Local standalone mode: allow mock login without an upstream URL token.
        if getattr(settings, 'SSO_DEBUG_MOCK', False) and self._should_redirect(request):
            effective_token = self._mock_token()
            sso_user = get_sso_user_info(effective_token)
            if sso_user:
                logger.warning('[SSOAuthMiddleware] mock login without token, user=%s', sso_user.get('username'))
                user = self._get_or_create_sso_user(sso_user)
                self._ensure_sso_organization(user, request)
                request.session['sso_token'] = effective_token
                request.session['sso_user'] = sso_user
                self._login_user(request, user)
                return

        # No token and no session: redirect page requests to SSO login.
        if self._should_redirect(request):
            logger.warning('[SSOAuthMiddleware] no token/session, redirecting to SSO')
            return HttpResponseRedirect(self._sso_host())

        logger.warning('[SSOAuthMiddleware] exempt path, allowing anonymous')

    def _extract_token(self, request):
        """Read token from query string or Authorization header.

        The upstream platform may pass either a raw JWT or the full
        Authorization value (e.g. "Bearer xxx") in ?token=. Keep the value
        as-is; downstream SSO helpers will use it directly as the
        Authorization header.
        """
        token = (request.GET.get('token') or '').strip()
        if token:
            return token

        auth_header = request.META.get('HTTP_AUTHORIZATION', '')
        if auth_header.lower().startswith('bearer '):
            return auth_header.strip()

        return ''

    def _mask_token(self, token):
        """Return a safe token preview for logging."""
        if not token:
            return ''
        if len(token) <= 16:
            return '*' * len(token)
        return f'{token[:8]}...{token[-4:]}(len={len(token)})'

    def _mock_token(self):
        return getattr(settings, 'SSO_MOCK_DEFAULT_TOKEN', '') or 'mock-local-user'

    def _sso_host(self):
        host = settings.SSO_USERINFO_HOST
        if not host:
            raise ImproperlyConfigured(
                'SSO_USERINFO_HOST environment variable must be set. '
                'Example: SSO_USERINFO_HOST=68.68.18.26:31798'
            )
        if not host.startswith(('http://', 'https://')):
            host = f'http://{host}'
        return host

    def _should_redirect(self, request):
        path = request.path_info
        return not any(path.startswith(prefix) for prefix in self.EXEMPT_PATH_PREFIXES)

    def _clear_sso_session(self, request):
        request.session.pop('sso_token', None)
        request.session.pop('sso_user', None)
        request.session.pop('organization_pk', None)

    def _login_user(self, request, user):
        if not request.user.is_authenticated or request.user.id != user.id:
            login(request, user, backend='django.contrib.auth.backends.ModelBackend')

    def _get_or_create_sso_user(self, sso_user):
        User = get_user_model()
        sso_id = str(sso_user.get('id') or '')
        username_from_sso = str(sso_user.get('username') or '').strip()

        # Some SSO implementations return id=null but provide a unique username.
        # Prefer id, fallback to username.
        if not sso_id:
            sso_id = username_from_sso

        if not sso_id:
            raise ValueError('SSO user info is missing both "id" and "username"')

        username = f"sso_{sso_id}"
        email = sso_user.get('email', '') or f"{username}@localhost"
        first_name = sso_user.get('nickName') or ''

        try:
            user, created = User.objects.get_or_create(
                username=username,
                defaults={
                    'email': email,
                    'first_name': first_name,
                    'is_active': True,
                    'is_staff': False,
                    'is_superuser': False,
                }
            )
        except User.MultipleObjectsReturned:
            # Defensive: if duplicates exist due to a race condition or legacy
            # data, reuse the earliest created user.
            user = User.objects.filter(username=username).order_by('date_joined').first()
            created = False

        # SSO users must not be able to log in via Label Studio's local password form.
        if created:
            user.set_unusable_password()
            user.save(update_fields=['password'])

        # Keep display name up to date on subsequent logins (safe fallback).
        if not created and first_name and user.first_name != first_name:
            user.first_name = first_name
            user.save(update_fields=['first_name'])

        return user

    def _ensure_sso_organization(self, user, request):
        from django.db import IntegrityError
        from organizations.models import Organization

        organization = None

        if user.has_organization:
            try:
                organization = user.own_organization
            except Organization.DoesNotExist:
                organization = None

        if organization is None:
            org_title = f"{user.first_name or user.username} annotation team"
            try:
                organization = Organization.create_organization(
                    created_by=user,
                    title=org_title,
                    )
            except IntegrityError:
                # Defensive: another request created the organization in parallel.
                organization = user.own_organization

        if not organization.has_user(user):
            organization.add_user(user)

        if user.active_organization_id != organization.id:
            user.active_organization = organization
            user.save(update_fields=['active_organization'])

        request.session['organization_pk'] = organization.id


class HttpSmartRedirectResponse(HttpResponsePermanentRedirect):
    pass


class CommonMiddlewareAppendSlashWithoutRedirect(CommonMiddleware):
    """ This class converts HttpSmartRedirectResponse to the common response
        of Django view, without redirect. This is necessary to match status_codes
        for urls like /url?q=1 and /url/?q=1. If you don't use it, you will have 302
        code always on pages without slash.
    """
    response_redirect_class = HttpSmartRedirectResponse

    def __init__(self, *args, **kwargs):
        # create django request resolver
        self.handler = BaseHandler()

        # prevent recursive includes
        old = settings.MIDDLEWARE
        name = self.__module__ + '.' + self.__class__.__name__
        settings.MIDDLEWARE = [i for i in settings.MIDDLEWARE if i != name]

        self.handler.load_middleware()

        settings.MIDDLEWARE = old
        super(CommonMiddlewareAppendSlashWithoutRedirect, self).__init__(*args, **kwargs)

    def get_full_path_with_slash(self, request):
        """ Return the full path of the request with a trailing slash appended
            without Exception in Debug mode
        """
        new_path = request.get_full_path(force_append_slash=True)
        # Prevent construction of scheme relative urls.
        new_path = escape_leading_slashes(new_path)
        return new_path

    def process_response(self, request, response):
        response = super(CommonMiddlewareAppendSlashWithoutRedirect, self).process_response(request, response)

        if isinstance(response, HttpSmartRedirectResponse):
            if not request.path.endswith('/'):
                # remove prefix SCRIPT_NAME
                path = request.path[len(settings.FORCE_SCRIPT_NAME):] if settings.FORCE_SCRIPT_NAME \
                    else request.path
                request.path = path + '/'
            # we don't need query string in path_info because it's in request.GET already
            request.path_info = request.path
            response = self.handler.get_response(request)

        return response


class SetSessionUIDMiddleware(CommonMiddleware):

    def process_request(self, request):
        if 'uid' not in request.session:
            request.session['uid'] = str(uuid4())


class ContextLogMiddleware(CommonMiddleware):

    def __init__(self, get_response):
        self.get_response = get_response
        self.log = ContextLog()

    def __call__(self, request):
        try:
            body = json.loads(request.body)
        except:
            body = {}
        response = self.get_response(request)
        self.log.send(request=request, response=response, body=body)
        return response


class DatabaseIsLockedRetryMiddleware(CommonMiddleware):
    """Workaround for sqlite performance issues
    we wait and retry request if database is locked"""

    def __init__(self, get_response):
        if settings.DJANGO_DB != settings.DJANGO_DB_SQLITE:
            raise MiddlewareNotUsed()
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        retries_number = 0
        sleep_time = 1
        backoff = 1.5
        while (
            response.status_code == 500
            and hasattr(response, 'content')
            and b'database-is-locked-error' in response.content
            and retries_number < 15
        ):
            time.sleep(sleep_time)
            response = self.get_response(request)
            retries_number += 1
            sleep_time *= backoff
        return response


class UpdateLastActivityMiddleware(CommonMiddleware):
    def process_view(self, request, view_func, view_args, view_kwargs):
        if hasattr(request, 'user') and request.method not in SAFE_METHODS:
            if request.user.is_authenticated:
                request.user.update_last_activity()
