"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeAttachmentFilename = safeAttachmentFilename;
exports.attachmentContentDisposition = attachmentContentDisposition;
exports.hasAllowedUploadExtension = hasAllowedUploadExtension;
/** Strips path segments and header-breaking characters from a stored filename. */
function safeAttachmentFilename(name, fallback = 'download') {
    const raw = String(name || '').replace(/\\/g, '/').split('/').pop() || fallback;
    const cleaned = raw.replace(/[\r\n"]/g, '').replace(/[^\w.\- ()]/g, '_').slice(0, 120).trim();
    return cleaned || fallback;
}
function attachmentContentDisposition(name) {
    return `attachment; filename="${safeAttachmentFilename(name)}"`;
}
function hasAllowedUploadExtension(originalName, allowedExtensions) {
    const base = String(originalName || '').replace(/\\/g, '/').split('/').pop() || '';
    const match = base.toLowerCase().match(/(\.[a-z0-9]+)$/);
    return Boolean(match && allowedExtensions.includes(match[1]));
}
