export const REVIEW_STATUS = {
  pending:  { label: '未审核',  color: '#9aa0a6' },  // 灰
  approved: { label: '已通过',  color: '#1a7f37' },  // 绿
  rejected: { label: '已驳回',  color: '#d93025' },  // 红
} as const;

export type ReviewStatusKey = keyof typeof REVIEW_STATUS;
