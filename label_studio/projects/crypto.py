"""Application-layer encryption helpers for project configuration validation."""

import base64
import binascii
import json

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class ProjectConfigDecryptionError(ValueError):
    """Raised when an encrypted project configuration envelope is invalid."""


def _decode_base64(value):
    if not isinstance(value, str):
        raise ProjectConfigDecryptionError()
    try:
        return base64.b64decode(value.encode('ascii'), validate=True)
    except (UnicodeEncodeError, binascii.Error):
        raise ProjectConfigDecryptionError()


def decrypt_project_config_payload(payload, encoded_key):
    """Decrypt and parse an AES-GCM project configuration request envelope."""
    if not isinstance(payload, dict):
        raise ProjectConfigDecryptionError()

    key = _decode_base64(encoded_key)
    iv = _decode_base64(payload.get('iv'))
    ciphertext = _decode_base64(payload.get('ciphertext'))
    if len(key) != 32 or len(iv) != 12:
        raise ProjectConfigDecryptionError()

    try:
        plaintext = AESGCM(key).decrypt(iv, ciphertext, None)
        decrypted_payload = json.loads(plaintext.decode('utf-8'))
    except (InvalidTag, UnicodeDecodeError, json.JSONDecodeError, ValueError):
        raise ProjectConfigDecryptionError()

    if not isinstance(decrypted_payload, dict):
        raise ProjectConfigDecryptionError()
    return decrypted_payload
