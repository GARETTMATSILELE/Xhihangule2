/** Strips path segments and header-breaking characters from a stored filename. */
export function safeAttachmentFilename(name: unknown, fallback = 'download'): string {
  const raw = String(name || '').replace(/\\/g, '/').split('/').pop() || fallback;
  const cleaned = raw.replace(/[\r\n"]/g, '').replace(/[^\w.\- ()]/g, '_').slice(0, 120).trim();
  return cleaned || fallback;
}

export function attachmentContentDisposition(name: unknown): string {
  return `attachment; filename="${safeAttachmentFilename(name)}"`;
}

export function hasAllowedUploadExtension(originalName: unknown, allowedExtensions: readonly string[]): boolean {
  const base = String(originalName || '').replace(/\\/g, '/').split('/').pop() || '';
  const match = base.toLowerCase().match(/(\.[a-z0-9]+)$/);
  return Boolean(match && allowedExtensions.includes(match[1]));
}
