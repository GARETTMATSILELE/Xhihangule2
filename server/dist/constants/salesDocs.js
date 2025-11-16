"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_DOCS_BY_STAGE = exports.STAGE_ORDER = exports.STAGES = exports.SALES_DOC_TYPES = void 0;
exports.isValidTransition = isValidTransition;
exports.SALES_DOC_TYPES = {
    OFFER_FORM: 'OFFER_FORM',
    TITLE_DOCUMENT: 'TITLE_DOCUMENT',
    KYC_FORM: 'KYC_FORM',
    AOS_DRAFT: 'AOS_DRAFT',
    BUYER_ID: 'BUYER_ID',
    SELLER_ID: 'SELLER_ID',
    AOS_SIGNED: 'AOS_SIGNED',
    WON_PACKAGE: 'WON_PACKAGE'
};
exports.STAGES = {
    OFFER: 'Offer',
    DUE_DILIGENCE: 'Due Diligence',
    CONTRACT: 'Contract',
    CLOSING: 'Closing',
    WON: 'Won'
};
exports.STAGE_ORDER = [
    exports.STAGES.OFFER,
    exports.STAGES.DUE_DILIGENCE,
    exports.STAGES.CONTRACT,
    exports.STAGES.CLOSING,
    exports.STAGES.WON
];
exports.ALLOWED_DOCS_BY_STAGE = {
    [exports.STAGES.OFFER]: [exports.SALES_DOC_TYPES.OFFER_FORM],
    [exports.STAGES.DUE_DILIGENCE]: [exports.SALES_DOC_TYPES.TITLE_DOCUMENT, exports.SALES_DOC_TYPES.KYC_FORM],
    [exports.STAGES.CONTRACT]: [exports.SALES_DOC_TYPES.AOS_DRAFT, exports.SALES_DOC_TYPES.BUYER_ID, exports.SALES_DOC_TYPES.SELLER_ID],
    [exports.STAGES.CLOSING]: [exports.SALES_DOC_TYPES.AOS_SIGNED],
    [exports.STAGES.WON]: [exports.SALES_DOC_TYPES.WON_PACKAGE]
};
function isValidTransition(from, to) {
    const fromIndex = exports.STAGE_ORDER.indexOf(from);
    const toIndex = exports.STAGE_ORDER.indexOf(to);
    if (fromIndex === -1 || toIndex === -1)
        return false;
    return toIndex >= fromIndex && toIndex - fromIndex <= 1;
}
