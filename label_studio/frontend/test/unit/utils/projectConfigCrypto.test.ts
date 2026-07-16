import { encryptProjectConfigPayload } from '../../../src/utils/projectConfigCrypto';

const TEST_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
const webcrypto = require('crypto').webcrypto;

beforeEach(() => {
  (global as any).TextEncoder = require('util').TextEncoder;
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: webcrypto,
  });
});

it('returns an encrypted envelope without the label XML plaintext', async () => {
  const payload = await encryptProjectConfigPayload({ label_config: '<View><Text name="text" /></View>' }, TEST_KEY);

  expect(payload.encrypted).toBe(true);
  expect(payload.iv).toBeTruthy();
  expect(payload.ciphertext).toBeTruthy();
  expect(JSON.stringify(payload)).not.toContain('<View>');
});

it('encrypts when Web Crypto subtle is unavailable on an HTTP page', async () => {
  Object.defineProperty(window, 'crypto', {
    configurable: true,
    value: { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) },
  });

  const payload = await encryptProjectConfigPayload({ label_config: '<View />' }, TEST_KEY);

  expect(payload.encrypted).toBe(true);
  expect(JSON.stringify(payload)).not.toContain('<View');
});
