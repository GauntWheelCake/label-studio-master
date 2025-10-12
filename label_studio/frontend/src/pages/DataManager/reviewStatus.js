export const normalizeReviewStatusKey = (value) => String(value ?? '').trim().toLowerCase();

const STATUS_SYNONYMS = {
  pending: ['pending', 'unreviewed', 'not_reviewed', 'not reviewed', 'none'],
  approved: ['approved', 'accept', 'accepted', 'approve'],
  rejected: ['rejected', 'reject', 'declined', 'decline'],
};

const resolveStatusKey = (input) => {
  const normalized = normalizeReviewStatusKey(input);
  if (!normalized) return null;

  for (const [key, synonyms] of Object.entries(STATUS_SYNONYMS)) {
    if (normalized === key) return key;
    if (synonyms.includes(normalized)) return key;
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

    const mappedKey = resolveStatusKey(candidate);
    if (mappedKey && translations[mappedKey]) {
      return translations[mappedKey];
    }
  }

  const fallbackKey = resolveStatusKey(status) ?? 'pending';
  return translations[fallbackKey] || translations.pending || fallbackKey;
};
