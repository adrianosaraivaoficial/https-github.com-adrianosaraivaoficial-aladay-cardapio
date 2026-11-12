export function validTaxId(value: unknown): boolean {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^(?:\d{11}|\d{14})$/.test(digits) || /^(\d)\1+$/.test(digits))
    return false;
  const baseLength = digits.length - 2;
  let base = digits.slice(0, baseLength);
  for (let check = 0; check < 2; check++) {
    const weights =
      digits.length === 11
        ? Array.from({ length: base.length }, (_, i) => base.length + 1 - i)
        : base.length === 12
          ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
          : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const remainder =
      [...base].reduce(
        (sum, digit, index) => sum + Number(digit) * weights[index],
        0,
      ) % 11;
    const expected = remainder < 2 ? 0 : 11 - remainder;
    if (Number(digits[baseLength + check]) !== expected) return false;
    base += expected;
  }
  return true;
}
