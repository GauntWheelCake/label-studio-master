import { t } from '../../i18n';

export const normalizeReviewStatusKey = (value) => String(value ?? '').trim().toLowerCase();

const REVIEW_STATUS_KEYS = ['pending', 'approved', 'rejected'];

const getDefaultReviewStatusLabels = () => REVIEW_STATUS_KEYS.reduce((acc, key) => {
  const translationKey = `dataManager.review.${key}`;
  const translated = t(translationKey);

  if (translated && translated !== translationKey) {
    acc[key] = translated;
  }

  return acc;
}, {});

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

const resolveStatusKey = (input) => {
  const normalized = normalizeReviewStatusKey(input);
  if (!normalized) return null;

  if (STATUS_SYNONYMS[normalized]) return normalized;

  for (const [key, synonyms] of Object.entries(STATUS_SYNONYMS)) {
    if (key === normalized) return key;
    if (synonyms.includes(normalized)) return key;
  }

  return null;
};

export const localizeReviewStatus = ({ translations = {}, status, display, value }) => {
  const dictionary = {
    ...getDefaultReviewStatusLabels(),
    ...translations,
  };

  const translationValues = new Set(
    Object.values(dictionary)
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

    const mappedKey = resolveStatusKey(candidate);
    if (mappedKey && dictionary[mappedKey]) {
      return dictionary[mappedKey];
    }
  }

  const fallbackKey = resolveStatusKey(status) ?? 'pending';
  return dictionary[fallbackKey] || dictionary.pending || fallbackKey;
};
