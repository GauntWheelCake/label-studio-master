"""Tests for encrypted project configuration validation transport."""

import base64
import json

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings
from django.test import TestCase, override_settings

from organizations.models import Organization
from projects.models import Project
from projects.serializers import ProjectSerializer
from users.models import User


TEST_KEY = base64.b64encode(b'0123456789abcdef0123456789abcdef').decode('ascii')


def encrypt_payload(payload):
    iv = b'0123456789ab'
    ciphertext = AESGCM(base64.b64decode(TEST_KEY)).encrypt(iv, json.dumps(payload).encode('utf-8'), None)
    return {
        'encrypted': True,
        'iv': base64.b64encode(iv).decode('ascii'),
        'ciphertext': base64.b64encode(ciphertext).decode('ascii'),
    }


class ProjectConfigCryptoTests(TestCase):
    label_config = '<View><Text name="text" value="$text" /></View>'

    def setUp(self):
        self.user = User.objects.create(email='business@pytest.net')
        self.organization = Organization.create_organization(created_by=self.user, title='Test Organization')
        self.project = Project.objects.create(
            title='Encryption test',
            label_config=self.label_config,
            created_by=self.user,
            organization=self.organization,
        )
        self.client.force_login(self.user)
        session = self.client.session
        session['organization_pk'] = self.organization.pk
        session.save()

    def validate(self, payload):
        return self.client.post(
            f'/api/projects/{self.project.id}/validate',
            data=json.dumps(payload),
            content_type='application/json',
        )

    def sample_task(self, payload):
        return self.client.post(
            f'/api/projects/{self.project.id}/sample-task/',
            data=json.dumps(payload),
            content_type='application/json',
        )

    def test_default_encryption_key_is_a_usable_aes_256_key(self):
        key = base64.b64decode(settings.PROJECT_CONFIG_ENCRYPTION_KEY)

        self.assertEqual(len(key), 32)

    @override_settings(PROJECT_CONFIG_ENCRYPTION_KEY=TEST_KEY)
    def test_project_config_validation_accepts_encrypted_payload(self):
        response = self.validate(encrypt_payload({'label_config': self.label_config}))

        self.assertEqual(response.status_code, 200)

    @override_settings(PROJECT_CONFIG_ENCRYPTION_KEY=TEST_KEY)
    def test_project_config_validation_rejects_tampered_ciphertext(self):
        payload = encrypt_payload({'label_config': self.label_config})
        ciphertext = bytearray(base64.b64decode(payload['ciphertext']))
        ciphertext[-1] ^= 1
        payload['ciphertext'] = base64.b64encode(ciphertext).decode('ascii')

        response = self.validate(payload)

        self.assertEqual(response.status_code, 400)
        self.assertNotIn(TEST_KEY, response.content.decode('utf-8'))
        self.assertNotIn(payload['ciphertext'], response.content.decode('utf-8'))

    @override_settings(PROJECT_CONFIG_ENCRYPTION_KEY=TEST_KEY)
    def test_project_config_validation_rejects_invalid_base64(self):
        response = self.validate({'encrypted': True, 'iv': '!', 'ciphertext': '!'})

        self.assertEqual(response.status_code, 400)

    def test_project_config_validation_keeps_plaintext_compatibility(self):
        response = self.validate({'label_config': self.label_config})

        self.assertEqual(response.status_code, 200)

    @override_settings(PROJECT_CONFIG_ENCRYPTION_KEY=TEST_KEY)
    def test_project_sample_task_accepts_encrypted_payload(self):
        response = self.sample_task(encrypt_payload({'label_config': self.label_config}))

        self.assertEqual(response.status_code, 200)
        self.assertIn('sample_task', response.json())

    def test_project_serializer_masks_creator_email(self):
        created_by = ProjectSerializer(self.project).data['created_by']

        self.assertEqual(created_by['email'], 'b***@pytest.net')
