/**
 * Нормализация и форматирование российских телефонов.
 *
 * Все телефоны в системе хранятся в формате `+79001234567` (E.164).
 * Принимаем на ввод: "+7...", "8...", "9..." (10 цифр без кода), с пробелами/дефисами.
 */

const RU_PREFIX = '+7';

export function normalizePhone(input: string): string {
  const digits = input.replace(/\D+/g, '');
  if (!digits) return '';

  let body: string;
  if (digits.startsWith('7')) {
    body = digits.slice(1);
  } else if (digits.startsWith('8')) {
    body = digits.slice(1);
  } else {
    body = digits;
  }

  return RU_PREFIX + body;
}

export function isValidRuPhone(input: string): boolean {
  const norm = normalizePhone(input);
  return /^\+7\d{10}$/.test(norm);
}

export function formatRuPhone(input: string): string {
  const norm = normalizePhone(input);
  if (norm.length < 12) return input;
  const d = norm.slice(2);
  return `+7 ${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6, 8)}-${d.slice(8, 10)}`;
}
