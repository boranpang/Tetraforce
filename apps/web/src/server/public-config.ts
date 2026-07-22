const DEFAULT_SUPPORT_EMAIL = "support@tetraforce.example";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function getSupportEmail() {
  const email = process.env.TETRAFORCE_SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;
  if (!EMAIL_PATTERN.test(email)) {
    throw new Error("TETRAFORCE_SUPPORT_EMAIL must be a valid email address.");
  }
  return email;
}
