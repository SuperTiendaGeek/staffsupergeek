export const normalizeEcuadorPhone = (phone?: string | null): string | null => {
  if (!phone) return null;

  let digits = phone.replace(/[^\d+]/g, "");
  if (!digits) return null;

  if (digits.startsWith("+")) digits = digits.slice(1);
  digits = digits.replace(/\D/g, "");

  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("0")) digits = `593${digits.slice(1)}`;
  if (!digits.startsWith("593") && digits.length === 9) digits = `593${digits}`;

  if (digits.length < 9) return null;
  return digits;
};

export const buildWhatsAppUrl = (phone: string | null | undefined, message: string): string | null => {
  const normalizedPhone = normalizeEcuadorPhone(phone);
  if (!normalizedPhone) return null;

  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
};
