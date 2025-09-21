// ✅ Sanitize and whitelist allowed image filenames
export const sanitizeImagePath = (path?: string): string => {
  if (!path) return "";

  // Remove unsafe characters (only allow letters, numbers, dot, underscore, dash)
  const safe = path.replace(/[^a-zA-Z0-9._-]/g, "");

  // Whitelist only safe image extensions
  if (!/\.(jpg|jpeg|png|gif)$/i.test(safe)) {
    return "";
  }

  return safe;
};
