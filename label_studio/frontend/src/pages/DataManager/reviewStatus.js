export const REVIEW_STATUS_FALLBACKS = {
  pending: '未审核',
  approved: '已通过',
  rejected: '已驳回',
};

export const normalizeReviewStatusKey = (value) => String(value ?? '').trim().toLowerCase();

export const localizeReviewStatus = ({ translations = {}, status, display, value }) => {
  const dictionary = {
    ...REVIEW_STATUS_FALLBACKS,
    ...translations,
  };
  const translationValues = Object.values(dictionary).map((item) => String(item ?? '').trim());
  const normalizedStatus = normalizeReviewStatusKey(status || 'pending');
  const fallback = dictionary[normalizedStatus] || dictionary.pending;
  const candidates = [value, display];

  for (const candidate of candidates) {
    if (candidate == null) continue;

    const candidateString = String(candidate).trim();
    if (!candidateString) continue;

    const normalizedCandidate = normalizeReviewStatusKey(candidateString);

    if (dictionary[normalizedCandidate]) {
      return dictionary[normalizedCandidate];
    }

    if (translationValues.includes(candidateString)) {
      return candidateString;
    }
  }

  return fallback ?? normalizedStatus;
};
