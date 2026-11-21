/** Client-safe. A clearly bad address never reaches Resend or the invite table. */
export function parseInviteEmail(value: string): string | null {
  const email = value.trim().toLowerCase();
  if (email.length > 254 || email.length < 6) return null;
  if (!/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(email)) return null;
  if (email.includes("..")) return null;
  return email;
}
