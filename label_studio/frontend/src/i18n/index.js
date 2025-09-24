import { zhCN } from './zh-CN';

const dictionaries = {
  'zh-CN': zhCN,
};

const DEFAULT_LOCALE = 'zh-CN';

export const t = (key, locale) => {
  const selectedLocale = locale || DEFAULT_LOCALE;
  const dictionary = dictionaries[selectedLocale] || dictionaries[DEFAULT_LOCALE] || {};
  return dictionary[key] || key;
};

export const getDictionary = (locale) => {
  const selectedLocale = locale || DEFAULT_LOCALE;
  return dictionaries[selectedLocale] || dictionaries[DEFAULT_LOCALE] || {};
};

export { zhCN };
