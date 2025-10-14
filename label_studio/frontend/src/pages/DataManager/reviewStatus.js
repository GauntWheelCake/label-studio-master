export const normalizeReviewStatusKey = (value) => String(value ?? '').trim().toLowerCase();

const STATUS_SYNONYMS = {
  pending: [
    'pending',
    'unreviewed',
    'not_reviewed',
    'not reviewed',
    'none',
  ],
  approved: [
    'approved',
    'accept',
    'accepted',
    'approve',
  ],
  rejected: [
    'rejected',
    'reject',
    'declined',
    'decline',
  ],
};

const buildDynamicSynonyms = (translations = {}) => {
  const entries = Object.entries(STATUS_SYNONYMS);
  const normalizedTranslations = Object.entries(translations)
    .reduce((acc, [key, value]) => {
      const normalizedValue = normalizeReviewStatusKey(value);
      if (normalizedValue) acc[key] = normalizedValue;
      return acc;
    }, {});

  return entries.reduce((acc, [key, baseSynonyms]) => {
    const normalizedKey = normalizeReviewStatusKey(key);
    const normalizedBase = baseSynonyms
      .map((synonym) => normalizeReviewStatusKey(synonym))
      .filter(Boolean);
    const result = new Set([normalizedKey, ...normalizedBase]);

    const translatedValue = normalizedTranslations[key];
    if (translatedValue) {
      result.add(translatedValue);
    }

    acc[key] = result;
    return acc;
  }, {});
};

const resolveStatusKey = (input, translations) => {
  const normalized = normalizeReviewStatusKey(input);
  if (!normalized) return null;

  const dynamicSynonyms = buildDynamicSynonyms(translations);

  for (const [key, synonyms] of Object.entries(dynamicSynonyms)) {
    if (synonyms.has(normalized)) return key;
  }

  return null;
};

export const localizeReviewStatus = ({ translations = {}, status, display, value }) => {
  const translationValues = new Set(
    Object.values(translations)
      .map((item) => String(item ?? '').trim())
      .filter(Boolean),
  );

  const candidateStrings = [value, display, status]
    .map((item) => (item == null ? '' : String(item).trim()))
    .filter(Boolean);

  for (const candidate of candidateStrings) {
    if (translationValues.has(candidate)) {
      return candidate;
    }

    const mappedKey = resolveStatusKey(candidate, translations);
    if (mappedKey && translations[mappedKey]) {
      return translations[mappedKey];
    }
  }

  const fallbackKey = resolveStatusKey(status, translations) ?? 'pending';
  return translations[fallbackKey] || translations.pending || fallbackKey;
};
