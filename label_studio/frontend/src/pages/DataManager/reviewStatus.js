export const REVIEW_STATUS_TRANSLATION_KEYS = {
  pending: 'dataManager.review.pending',
  approved: 'dataManager.review.approved',
  rejected: 'dataManager.review.rejected',
};

export const createReviewStatusTranslations = (translate = (key) => key) =>
  Object.entries(REVIEW_STATUS_TRANSLATION_KEYS).reduce((acc, [status, translationKey]) => {
    acc[status] = translate(translationKey);
    return acc;
  }, {});

export const normalizeReviewStatusKey = (value) => String(value ?? '').trim().toLowerCase();

export const localizeReviewStatus = ({ translations = {}, status, display, value }) => {
  const translationValues = Object.values(translations).map((item) => String(item ?? '').trim());
  const normalizedStatus = normalizeReviewStatusKey(status || 'pending');
  const fallback = translations[normalizedStatus] || translations.pending;
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
  }

  return fallback ?? normalizedStatus;
};
