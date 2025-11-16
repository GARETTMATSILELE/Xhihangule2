export const SALES_DOC_TYPES = {
  OFFER_FORM: 'OFFER_FORM',
  TITLE_DOCUMENT: 'TITLE_DOCUMENT',
  KYC_FORM: 'KYC_FORM',
  AOS_DRAFT: 'AOS_DRAFT',
  BUYER_ID: 'BUYER_ID',
  SELLER_ID: 'SELLER_ID',
  AOS_SIGNED: 'AOS_SIGNED',
  WON_PACKAGE: 'WON_PACKAGE'
} as const;

export const STAGES = {
  OFFER: 'Offer',
  DUE_DILIGENCE: 'Due Diligence',
  CONTRACT: 'Contract',
  CLOSING: 'Closing',
  WON: 'Won'
} as const;

export const STAGE_ORDER: string[] = [
  STAGES.OFFER,
  STAGES.DUE_DILIGENCE,
  STAGES.CONTRACT,
  STAGES.CLOSING,
  STAGES.WON
];

export const ALLOWED_DOCS_BY_STAGE: Record<string, string[]> = {
  [STAGES.OFFER]: [SALES_DOC_TYPES.OFFER_FORM],
  [STAGES.DUE_DILIGENCE]: [SALES_DOC_TYPES.TITLE_DOCUMENT, SALES_DOC_TYPES.KYC_FORM],
  [STAGES.CONTRACT]: [SALES_DOC_TYPES.AOS_DRAFT, SALES_DOC_TYPES.BUYER_ID, SALES_DOC_TYPES.SELLER_ID],
  [STAGES.CLOSING]: [SALES_DOC_TYPES.AOS_SIGNED],
  [STAGES.WON]: [SALES_DOC_TYPES.WON_PACKAGE]
};

export function isValidTransition(from: string, to: string): boolean {
  const fromIndex = STAGE_ORDER.indexOf(from);
  const toIndex = STAGE_ORDER.indexOf(to);
  if (fromIndex === -1 || toIndex === -1) return false;
  return toIndex >= fromIndex && toIndex - fromIndex <= 1;
}



