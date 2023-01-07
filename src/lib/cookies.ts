export function getCookies() {
  return Object.fromEntries(document.cookie.split(/; ?/).map((cookie) => cookie.split('=')));
}

export function setCookie(
  name: string,
  value: string,
  {
    maxAge,
    expiresAt,
    del,
    permanent,
  }: { maxAge?: string | number; expiresAt?: string; del?: boolean; permanent?: boolean } = {},
) {
  const sMaxAge = maxAge ? `; max-age=${maxAge.toString}` : '';
  const sExpiresAt = expiresAt ? `; expires-at=${expiresAt}` : '';
  const sDel = del ? '; max-age=0' : '';
  const sPerm = permanent ? '; expires=Thu, 19 Jan 2038 00:00:00 GMT' : '';
  document.cookie = `${name}=${value}; Secure; SameSite=Lax${sMaxAge}${sExpiresAt}${sDel}${sPerm}`;
}
