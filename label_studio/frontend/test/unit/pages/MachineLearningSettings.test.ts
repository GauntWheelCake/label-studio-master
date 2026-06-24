import { getDefaultBackendCandidates } from '../../../src/pages/Settings/MachineLearningSettings/backendCandidates';

describe('getDefaultBackendCandidates', () => {
  test('uses configured image backend before local fallbacks', () => {
    const candidates = getDefaultBackendCandidates('image', {
      protocol: 'http:',
      hostname: 'localhost',
    }, {
      mlImageHost: 'http://ml-backend-image:9091',
      mlHost: 'http://legacy-ml:9091',
    });

    expect(candidates).toEqual([
      'http://ml-backend-image:9091',
      'http://legacy-ml:9091',
      'http://127.0.0.1:9091',
      'http://host.docker.internal:9091',
    ]);
  });

  test('returns configured text backend only when text host exists', () => {
    expect(getDefaultBackendCandidates('text', {
      protocol: 'http:',
      hostname: 'localhost',
    }, {
      mlTextHost: 'http://ml-backend-text:9092',
    })).toEqual(['http://ml-backend-text:9092']);

    expect(getDefaultBackendCandidates('text', {
      protocol: 'http:',
      hostname: 'localhost',
    }, {})).toEqual([]);
  });

  test('keeps image and text candidate lists separate', () => {
    const location = {
      protocol: 'http:',
      hostname: 'label.example.com',
    };
    const appSettings = {
      mlImageHost: 'http://ml-backend-image:9091',
      mlTextHost: 'http://ml-backend-text:9092',
    };

    expect(getDefaultBackendCandidates('image', location, appSettings)).toEqual([
      'http://ml-backend-image:9091',
      'http://label.example.com:9000',
    ]);
    expect(getDefaultBackendCandidates('text', location, appSettings)).toEqual([
      'http://ml-backend-text:9092',
    ]);
  });
});
