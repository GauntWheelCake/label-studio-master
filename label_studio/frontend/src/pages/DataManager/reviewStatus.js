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
