import { zhCN } from './zh-CN';

export type Locale = 'zh-CN';
export type TranslationDictionary = Record<string, string>;

const dictionaries: Record<Locale, TranslationDictionary> = {
  'zh-CN': zhCN,
};

const DEFAULT_LOCALE: Locale = 'zh-CN';

export const t = (key: string, locale: Locale = DEFAULT_LOCALE): string => {
  const dictionary = dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
  return dictionary[key] ?? key;
};

export const getDictionary = (locale: Locale = DEFAULT_LOCALE): TranslationDictionary => {
  return dictionaries[locale] ?? dictionaries[DEFAULT_LOCALE];
};

export { zhCN };
