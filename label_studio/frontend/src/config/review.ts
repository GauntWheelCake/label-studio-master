export const REVIEW_STATUS = {
  // 统一翻译为“待审核”，供任何 UI 引用同一份中文文案
  pending:  { label: '待审核',  color: '#9aa0a6' },  // 灰
  approved: { label: '已通过',  color: '#1a7f37' },  // 绿
  rejected: { label: '已驳回',  color: '#d93025' },  // 红
} as const;

export type ReviewStatusKey = keyof typeof REVIEW_STATUS;
