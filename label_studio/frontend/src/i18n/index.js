import { zhCN } from './zh-CN';

const DEFAULT_LOCALE = 'zh-CN';

const dictionaries = {
  'zh-CN': zhCN,
};

export const t = (key, locale = DEFAULT_LOCALE) => {
  const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  return dictionary[key] ?? key;
};

export const getDictionary = (locale = DEFAULT_LOCALE) => {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
};

export { zhCN };
