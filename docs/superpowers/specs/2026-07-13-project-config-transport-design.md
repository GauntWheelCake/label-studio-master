# Project Configuration Transport Design

## Goal

Hide project label configuration XML from the browser Network request payload
for `POST /api/projects/:pk/validate`, and mask project creator email addresses
in project API responses. The scope is intentionally limited to these two
behaviors.

## Chosen Approach

Use a shared AES-256-GCM key for the validation request only.

- The environment variable `PROJECT_CONFIG_ENCRYPTION_KEY` contains a Base64
  encoded 32-byte key.
- Django reads the key and exposes it in the existing `window.APP_SETTINGS`
  page configuration so the browser can encrypt requests.
- The browser encrypts the UTF-8 JSON value `{ "label_config": "..." }` with
  Web Crypto AES-GCM and a new random 12-byte IV per request.
- The browser sends `{ "encrypted": true, "iv": "...", "ciphertext": "..." }`,
  with `iv` and `ciphertext` Base64 encoded.
- The validation endpoint detects the envelope, decrypts it, and then uses the
  existing validation logic with the recovered `label_config`.

This is application-layer obfuscation for the Network view, not a replacement
for HTTPS. The shared key is intentionally visible to the browser and must not
be treated as protection against a network attacker.

## Compatibility and Errors

- Requests without `encrypted: true` keep the existing plaintext behavior.
- An encrypted request with a missing field, invalid Base64, invalid key,
  invalid JSON, failed AES-GCM authentication, or missing decrypted
  `label_config` returns HTTP 400.
- Decryption failures never fall back to parsing the request as plaintext.
- Error responses and logs must not include the key, ciphertext, IV, or
  decrypted configuration.
- Only `/validate` is changed. Project creation, save, import, annotation,
  SSO, user profile, and `/sample-task` behavior remain unchanged.

## Email Masking

`ProjectSerializer.created_by` uses a project-only creator serializer. It masks
the serialized email without changing the user model or the global
`UserSimpleSerializer`.

- `shared-admin@huibiaosystem.local` becomes `s***@huibiaosystem.local`.
- An empty email remains empty.
- A one-character local part becomes that character followed by `***`.
- A malformed value without `@` keeps its first character and appends `***`.

Project list, detail, and create responses are affected. SSO, authentication,
user profile, and non-project user endpoints retain their current email output.

## Implementation Boundaries

Backend:

- Add the environment-backed setting and page configuration entry.
- Add a focused decrypt helper with envelope validation.
- Use the helper only from `ProjectLabelConfigValidateAPI.post()`.
- Add a project-specific creator serializer.

Frontend:

- Add a focused Web Crypto encryption helper.
- Encrypt the validation payload in the project configuration screen before
  `api.callApi('validateConfig', ...)`.
- Surface an encryption failure through the existing validation error path and
  do not issue a plaintext retry.

## Tests

Backend tests cover successful encrypted validation, modified ciphertext,
malformed envelopes, plaintext compatibility, and masked creator email in
project responses. Frontend tests cover envelope construction and verify the
validation request does not contain raw label XML when encryption is enabled.
