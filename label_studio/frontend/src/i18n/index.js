import { defaultLocale } from './default';
import { zhCN } from './zh-CN';

const DEFAULT_LOCALE = 'zh-CN';

const builtinDictionaries = {
  default: defaultLocale,
  [DEFAULT_LOCALE]: zhCN,
};

const runtimeDictionaries = {};

const normalizeLocale = (locale) => {
  if (!locale) return DEFAULT_LOCALE;

  const normalized = String(locale).trim();
  if (!normalized) return DEFAULT_LOCALE;

  const lowered = normalized.toLowerCase().replace('_', '-');

  if (lowered.startsWith('zh')) return DEFAULT_LOCALE;

  return normalized;
};

const resolveDictionaries = (locale) => {
  const normalizedLocale = normalizeLocale(locale);
  const baseDictionary = {
    ...(builtinDictionaries.default ?? {}),
    ...(builtinDictionaries[DEFAULT_LOCALE] ?? {}),
  };
  const builtin = builtinDictionaries[normalizedLocale] ?? {};
  const runtimeDefault = runtimeDictionaries[DEFAULT_LOCALE] ?? {};
  const runtimeLocale = runtimeDictionaries[normalizedLocale] ?? {};

  const merged = {
    ...baseDictionary,
    ...builtin,
    ...runtimeDefault,
    ...runtimeLocale,
  };

  return Object.keys(merged).reduce((dictionary, key) => {
    const value = merged[key];
    const fallback = baseDictionary[key];

    if (value == null || value === key) {
      dictionary[key] = fallback ?? key;
      return dictionary;
    }

    dictionary[key] = value;
    return dictionary;
  }, {});
};

export const registerDictionary = (locale, entries) => {
  if (!entries || typeof entries !== 'object') return;

  const normalizedLocale = normalizeLocale(locale);
  runtimeDictionaries[normalizedLocale] = {
    ...(runtimeDictionaries[normalizedLocale] ?? {}),
    ...entries,
  };
};

export const getDictionary = (locale) => resolveDictionaries(locale);

export const t = (key, locale) => {
  const dictionary = resolveDictionaries(locale);
  const value = dictionary?.[key];

  if (value == null) return key;

  return value;
};

export const initializeI18n = () => {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const candidateLocales = [
    window.APP_SETTINGS?.ui?.language,
    window.APP_SETTINGS?.LANGUAGE,
    window.navigator?.language,
    window.navigator?.languages?.[0],
  ];

  const resolvedLocale = normalizeLocale(candidateLocales.find(Boolean));
  const runtimeDictionary = window.APP_SETTINGS?.i18n;

  if (runtimeDictionary && typeof runtimeDictionary === 'object') {
    registerDictionary(resolvedLocale, runtimeDictionary);
  }

  window.APP_SETTINGS = window.APP_SETTINGS ?? {};
  window.APP_SETTINGS.i18n = getDictionary(resolvedLocale);
  window.APP_SETTINGS.locale = resolvedLocale;

  return resolvedLocale;
};

export { zhCN };
