// delivery-service/src/utils/sanitize.ts
export function sanitizeForLog(value: any): any {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.replace(/[\r\n\t]+/g, ' ').replace(/[^\x20-\x7E]/g, '');
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map(sanitizeForLog);
  if (typeof value === 'object') {
    const safe: any = {};
    for (const k of Object.keys(value)) {
      const v = value[k];
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
        safe[k] = sanitizeForLog(v);
      }
    }
    return safe;
  }
  return String(value);
}
