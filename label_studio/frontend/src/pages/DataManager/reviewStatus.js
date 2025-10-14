export const normalizeReviewStatusKey = (value) => String(value ?? '').trim().toLowerCase();

const STATUS_SYNONYMS = {
  pending: [
    'pending',
    'unreviewed',
    'not_reviewed',
    'not reviewed',
    'none',
    '未审核',
    '待审核',
  ],
  approved: [
    'approved',
    'accept',
    'accepted',
    'approve',
    '已通过',
    '通过',
    '审核通过',
  ],
  rejected: [
    'rejected',
    'reject',
    'declined',
    'decline',
    '已驳回',
    '驳回',
    '拒绝',
    '已拒绝',
    '审核未通过',
  ],
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
