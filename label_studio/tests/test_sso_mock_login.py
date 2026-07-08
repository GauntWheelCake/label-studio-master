import pytest
from django.contrib.auth.models import AnonymousUser
from django.contrib.sessions.middleware import SessionMiddleware
from django.http import HttpResponseRedirect
from django.test import RequestFactory, override_settings
from types import SimpleNamespace

from core.middleware import SSOAuthMiddleware
from core.utils.sso import get_sso_user_info


def _request(path='/'):
    request = RequestFactory().get(path)
    SessionMiddleware(lambda req: None).process_request(request)
    request.user = AnonymousUser()
    return request


def _patch_login_dependencies(monkeypatch):
    monkeypatch.setattr(
        SSOAuthMiddleware,
        '_get_or_create_sso_user',
        lambda self, sso_user: SimpleNamespace(id=sso_user['id'], is_authenticated=True),
    )
    monkeypatch.setattr(
        SSOAuthMiddleware,
        '_ensure_sso_organization',
        lambda self, user, request: request.session.__setitem__('organization_pk', 'mock-org'),
    )
    monkeypatch.setattr(
        SSOAuthMiddleware,
        '_login_user',
        lambda self, request, user: setattr(request, 'user', user),
    )


@override_settings(SSO_DEBUG_MOCK=True, SSO_MOCK_DEFAULT_TOKEN='local-default')
def test_mock_mode_logs_in_without_url_token(monkeypatch):
    _patch_login_dependencies(monkeypatch)
    request = _request('/')

    response = SSOAuthMiddleware(lambda req: None).process_request(request)

    assert response is None
    assert request.user.is_authenticated
    assert request.session['sso_token'] == 'local-default'
    assert request.session['sso_user']['username'].startswith('mock-user-')


@override_settings(SSO_DEBUG_MOCK=True, SSO_MOCK_DEFAULT_TOKEN='local-default')
def test_mock_mode_refreshes_cached_session_user(monkeypatch):
    _patch_login_dependencies(monkeypatch)
    request = _request('/')
    request.session['sso_token'] = 'local-default'
    request.session['sso_user'] = {
        'id': 1,
        'username': 'cached-user',
        'email': 'cached-user@example.test',
        'nickName': 'Cached User',
        'enabled': True,
        'userAvatarPath': '',
    }

    response = SSOAuthMiddleware(lambda req: None).process_request(request)

    assert response is None
    assert request.user.is_authenticated
    assert request.session['sso_user']['userAvatarPath'] == '/static/images/mock-avatar.jpg'


@override_settings(
    SSO_DEBUG_MOCK=True,
    SSO_MOCK_USER_ID='42',
    SSO_MOCK_USERNAME='local-alice',
    SSO_MOCK_EMAIL='alice@example.test',
    SSO_MOCK_NICKNAME='Local Alice',
    SSO_MOCK_AVATAR='/static/images/cute.svg',
)
def test_mock_user_can_be_configured_from_settings():
    user = get_sso_user_info('any-token')

    assert user == {
        'id': '42',
        'username': 'local-alice',
        'email': 'alice@example.test',
        'nickName': 'Local Alice',
        'enabled': True,
        'userAvatarPath': '/static/images/cute.svg',
    }


@override_settings(SSO_DEBUG_MOCK=True)
def test_mock_user_is_deterministic_per_token():
    first = get_sso_user_info('token-a')
    second = get_sso_user_info('token-a')
    other = get_sso_user_info('token-b')

    assert first['id'] == second['id']
    assert first['username'] == second['username']
    assert first['id'] != other['id']
    assert first['userAvatarPath'] == '/static/images/mock-avatar.jpg'


@override_settings(SSO_DEBUG_MOCK=True, SSO_MOCK_AVATAR='')
def test_mock_avatar_can_be_disabled():
    user = get_sso_user_info('token-a')

    assert user['userAvatarPath'] == ''


@override_settings(SSO_DEBUG_MOCK=False, SSO_USERINFO_HOST='sso.example.test')
def test_non_mock_mode_still_redirects_to_external_sso_without_token():
    request = _request('/')

    response = SSOAuthMiddleware(lambda req: None).process_request(request)

    assert isinstance(response, HttpResponseRedirect)
    assert response.url == 'http://sso.example.test'
