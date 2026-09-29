const CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function newId(prefix: string): string {
  let result = '';
  for (let i = 0; i < 10; i++) {
    result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return prefix ? `${prefix}_${result}` : result;
}
