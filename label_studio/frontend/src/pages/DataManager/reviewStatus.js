import { REVIEW_STATUS } from '../../config/review';

export const normalizeReviewStatusKey = (value) => String(value ?? '').trim().toLowerCase();

const STATUS_LABELS = Object.entries(REVIEW_STATUS).reduce((acc, [key, config]) => {
  acc[normalizeReviewStatusKey(key)] = String(config?.label ?? '').trim() || key;
  return acc;
}, {});

const ENGLISH_ALIASES = Object.entries({
  pending: ['pending', 'not reviewed', 'not_reviewed', 'not-reviewed'],
  approved: ['approved', 'accepted', 'passed'],
  rejected: ['rejected', 'declined', 'failed'],
}).reduce((acc, [key, aliases]) => {
  const normalizedKey = normalizeReviewStatusKey(key);

  aliases.forEach((alias) => {
    const normalizedAlias = normalizeReviewStatusKey(alias);

    if (!normalizedAlias) return;

    acc[normalizedAlias] = normalizedKey;
  });

  return acc;
}, {});

const resolveLocalizedLabel = (translations, key) => {
  const normalizedKey = normalizeReviewStatusKey(key);

  return (
    translations[normalizedKey]
    || STATUS_LABELS[normalizedKey]
    || translations.pending
    || STATUS_LABELS.pending
    || normalizedKey
  );
};

export const localizeReviewStatus = ({ translations = {}, status, display, value }) => {
  const translationValues = Object.values(translations).map((item) => String(item ?? '').trim());
  const normalizedStatus = normalizeReviewStatusKey(status || 'pending');
  const fallback = resolveLocalizedLabel(translations, normalizedStatus);
  const candidates = [value, display];

  for (const candidate of candidates) {
    if (candidate == null) continue;

    const candidateString = String(candidate).trim();
    if (!candidateString) continue;

    const normalizedCandidate = normalizeReviewStatusKey(candidateString);

    if (translations[normalizedCandidate]) {
      return translations[normalizedCandidate];
    }

    if (translationValues.includes(candidateString)) {
      return candidateString;
    }

    const aliasKey = ENGLISH_ALIASES[normalizedCandidate];

    if (aliasKey) {
      return resolveLocalizedLabel(translations, aliasKey);
    }
  }

  return fallback;
};
