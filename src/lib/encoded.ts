export function encoded(s: string | undefined) {
  return s ? encodeURIComponent(s) : '';
}
