describe('datasetManagementApi mock mode', () => {
  const loadApi = () => {
    jest.resetModules();
    return require('../../../src/utils/datasetManagementApi');
  };

  beforeEach(() => {
    localStorage.clear();
    global.window.APP_SETTINGS = {
      ssoDebugMock: true,
      ssoHost: '',
    };
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
    localStorage.clear();
  });

  test('returns model class options without an SSO token in mock mode', async () => {
    const { getSsoDict } = loadApi();

    const options = await getSsoDict('model_class');

    expect(options).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: expect.any(String), value: '10001', id: '10001' }),
    ]));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('returns a deterministic dataset payload without an SSO token in mock mode', async () => {
    const { createFeDataset } = loadApi();

    const result = await createFeDataset({ name: 'Demo Project', dataType: 10001 });

    expect(result).toEqual({
      id: 'mock-dataset-10001-demo-project',
      uploadPrefix: 'mock/10001/demo-project',
    });
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
