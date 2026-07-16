# Project Configuration Transport Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Encrypt project configuration validation payloads and mask creator emails in project responses.

**Architecture:** A shared Base64 AES-256-GCM key is read from Django settings and exposed through the existing page settings object. A narrow browser helper encrypts only the validation payload; a narrow backend helper decrypts only recognized envelopes before the existing validation logic runs. A project-specific serializer masks only project creator emails.

**Tech Stack:** Django REST Framework, Python `cryptography` AESGCM, React, Web Crypto API, pytest, Jest.

## Global Constraints

- Use `PROJECT_CONFIG_ENCRYPTION_KEY` as a Base64-encoded 32-byte AES key.
- Change only `POST /api/projects/:pk/validate`; preserve plaintext compatibility.
- Do not modify SSO, user profile, project save/create, sample-task, or database values.
- Never log or return a key, IV, ciphertext, or decrypted label configuration after a decryption failure.

---

### Task 1: Backend encrypted validation boundary

**Files:**
- Create: `label_studio/projects/crypto.py`
- Modify: `label_studio/core/settings/base.py`
- Modify: `label_studio/core/context_processors.py`
- Modify: `label_studio/projects/api.py`
- Test: `label_studio/tests/test_project_config_crypto.py`

**Interfaces:**
- Produces `decrypt_project_config_payload(payload, encoded_key) -> dict`.
- Consumes an envelope with `encrypted`, `iv`, and `ciphertext` strings.
- Produces HTTP 400 for malformed encrypted envelopes and existing behavior for plaintext requests.

- [ ] **Step 1: Write failing backend tests**

```python
def test_project_config_validation_accepts_encrypted_payload(client_and_token, configured_project):
    payload = encrypt_payload({'label_config': VALID_CONFIG}, TEST_KEY)
    response = client.post(f'/api/projects/{configured_project.id}/validate', data=json.dumps(payload), content_type='application/json')
    assert response.status_code == 200

def test_project_config_validation_rejects_tampered_ciphertext(client_and_token, configured_project):
    payload = encrypt_payload({'label_config': VALID_CONFIG}, TEST_KEY)
    payload['ciphertext'] = payload['ciphertext'][:-2] + 'AA'
    response = client.post(f'/api/projects/{configured_project.id}/validate', data=json.dumps(payload), content_type='application/json')
    assert response.status_code == 400
```

- [ ] **Step 2: Run the backend tests to verify red**

Run: `pytest label_studio/tests/test_project_config_crypto.py -q`

Expected: encrypted requests fail because the endpoint reads only `label_config`.

- [ ] **Step 3: Implement settings, decrypt helper, and endpoint integration**

```python
# settings/base.py
PROJECT_CONFIG_ENCRYPTION_KEY = get_env('PROJECT_CONFIG_ENCRYPTION_KEY', '')

# context_processors.py app_settings
'projectConfigEncryptionKey': django_settings.PROJECT_CONFIG_ENCRYPTION_KEY,

# projects/api.py
payload = decrypt_project_config_payload(request.data, settings.PROJECT_CONFIG_ENCRYPTION_KEY) if request.data.get('encrypted') is True else request.data
label_config = payload.get('label_config')
```

The helper Base64-decodes the configured key, IV, and ciphertext with validation, checks the decoded key is 32 bytes and IV is 12 bytes, decrypts with `AESGCM`, UTF-8-decodes and JSON-parses the plaintext, and raises `RestValidationError` without sensitive content on any failure.

- [ ] **Step 4: Run the backend tests to verify green**

Run: `pytest label_studio/tests/test_project_config_crypto.py -q`

Expected: all encrypted, malformed, tampered, and plaintext-compatibility tests pass.

### Task 2: Project-only creator email masking

**Files:**
- Modify: `label_studio/projects/serializers.py`
- Modify: `label_studio/tests/test_api.py`

**Interfaces:**
- Produces `ProjectCreatorSerializer`, a `UserSimpleSerializer` subclass with a masked serialized `email` field.
- `ProjectSerializer.created_by` consumes the project-only serializer.

- [ ] **Step 1: Write failing response tests**

```python
def test_project_list_masks_creator_email(client_and_token):
    project = Project.objects.create(title='Masked', created_by=client_and_token[1].user, organization=client_and_token[1].user.active_organization)
    response = client_and_token[0].get('/api/projects/')
    item = next(item for item in response.json() if item['id'] == project.id)
    assert item['created_by']['email'] == 'a***@example.com'
```

- [ ] **Step 2: Run the response test to verify red**

Run: `pytest label_studio/tests/test_api.py::test_project_list_masks_creator_email -q`

Expected: failure because the response contains the full address.

- [ ] **Step 3: Implement the project-only serializer**

```python
class ProjectCreatorSerializer(UserSimpleSerializer):
    email = serializers.SerializerMethodField()

    def get_email(self, user):
        return mask_project_creator_email(user.email)

ProjectSerializer.created_by = ProjectCreatorSerializer(default=CreatedByFromContext())
```

`mask_project_creator_email` preserves an empty value, otherwise preserves the first local-part character and full domain, and appends `***`; malformed values retain only their first character and `***`.

- [ ] **Step 4: Run project API tests to verify green**

Run: `pytest label_studio/tests/test_api.py -q`

Expected: project response masking tests and existing API tests pass.

### Task 3: Browser encryption helper and validation call

**Files:**
- Create: `label_studio/frontend/src/utils/projectConfigCrypto.js`
- Modify: `label_studio/frontend/src/pages/CreateProject/Config/Config.js`
- Test: `label_studio/frontend/test/unit/utils/projectConfigCrypto.test.ts`

**Interfaces:**
- Produces `encryptProjectConfigPayload(payload, encodedKey) -> Promise<{encrypted: true, iv: string, ciphertext: string}>`.
- `Config.js` reads `window.APP_SETTINGS.projectConfigEncryptionKey` and sends the returned envelope to `validateConfig`.

- [ ] **Step 1: Write a failing browser helper test**

```typescript
it('returns an envelope without the XML plaintext', async () => {
  const payload = await encryptProjectConfigPayload({ label_config: '<View />' }, TEST_KEY);
  expect(payload).toMatchObject({ encrypted: true });
  expect(JSON.stringify(payload)).not.toContain('<View />');
});
```

- [ ] **Step 2: Run the unit test to verify red**

Run: `npm test -- --selectProjects unit projectConfigCrypto.test.ts --runInBand`

Expected: failure because the helper does not exist.

- [ ] **Step 3: Implement browser encryption and connect the call site**

```javascript
const key = await crypto.subtle.importKey('raw', base64ToBytes(encodedKey), 'AES-GCM', false, ['encrypt']);
const iv = crypto.getRandomValues(new Uint8Array(12));
const plaintext = new TextEncoder().encode(JSON.stringify(payload));
const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
return { encrypted: true, iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
```

If the configured key is absent or invalid, throw an error before `api.callApi`; `Config.js` catches it and calls the existing validation error setter without a plaintext retry.

- [ ] **Step 4: Run the browser unit test to verify green**

Run: `npm test -- --selectProjects unit projectConfigCrypto.test.ts --runInBand`

Expected: the helper returns a ciphertext envelope and does not contain the XML plaintext.

### Task 4: Focused regression verification and documentation

**Files:**
- Modify: `docs/maintenance/transport-encryption-and-email-masking.md`

- [ ] **Step 1: Update the maintenance document with the exact environment variable and browser verification steps**

Add `PROJECT_CONFIG_ENCRYPTION_KEY=<Base64 AES-256 key>` and state that `POST /api/projects/:pk/validate` displays only `encrypted`, `iv`, and `ciphertext` in Network.

- [ ] **Step 2: Run focused backend and frontend test suites**

Run: `pytest label_studio/tests/test_project_config_crypto.py label_studio/tests/test_api.py -q`

Run: `npm test -- --selectProjects unit projectConfigCrypto.test.ts --runInBand`

Expected: all selected tests pass.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check`

Expected: no whitespace errors; diff includes only the scoped encryption, masking, tests, and maintenance documentation.
