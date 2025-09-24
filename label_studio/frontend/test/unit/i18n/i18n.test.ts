describe('i18n helper', () => {
  test('returns zh-CN translations for known keys', () => {
    jest.isolateModules(() => {
      const i18n = require('../../../src/i18n');

      expect(i18n.t('createProject.header.title')).toBe('创建项目');
      expect(i18n.t('menubar.menu.logout')).toBe('退出登录');
    });
  });

  test('merges runtime dictionaries and keeps zh-CN fallbacks', () => {
    jest.isolateModules(() => {
      const i18n = require('../../../src/i18n');

      i18n.registerDictionary('custom-locale', {
        'importPage.dropzone.instructionsLine1': '测试拖拽',
      });

      expect(i18n.t('importPage.dropzone.instructionsLine1', 'custom-locale')).toBe('测试拖拽');
      expect(i18n.t('menubar.menu.logout', 'custom-locale')).toBe('退出登录');
    });
  });

  test('initializes from window.APP_SETTINGS when available', () => {
    jest.isolateModules(() => {
      const previousAppSettings = global.window?.APP_SETTINGS;

      global.window.APP_SETTINGS = {
        ui: { language: 'zh-cn' },
        i18n: {
          'menubar.menu.logout': '安全退出',
        },
      };

      const i18n = require('../../../src/i18n');

      i18n.initializeI18n();

      expect(i18n.t('menubar.menu.logout')).toBe('安全退出');
      expect(i18n.t('createProject.header.title')).toBe('创建项目');

      global.window.APP_SETTINGS = previousAppSettings;
    });
  });
});
