/**
 * Normalise an Ethiopian mobile number to +251XXXXXXXXX.
 * Accepts: 0911223344, 911223344, 251911223344, +251 911 22 33 44,
 * and Safaricom 07… numbers. Returns null if it is not a valid mobile.
 */
export function normalizeEthiopianPhone(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  let local: string;

  if (digits.startsWith("251") && digits.length === 12) local = digits.slice(3);
  else if (digits.startsWith("0") && digits.length === 10) local = digits.slice(1);
  else if (digits.length === 9) local = digits;
  else return null;

  // Ethio telecom mobiles start with 9, Safaricom with 7.
  if (!/^[79]\d{8}$/.test(local)) return null;
  return `+251${local}`;
}
