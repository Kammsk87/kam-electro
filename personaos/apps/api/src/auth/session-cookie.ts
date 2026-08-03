const cookieName = "personaos_session";
const maxAgeSeconds = 60 * 60 * 24 * 7;

export function getSessionCookieName() {
  return cookieName;
}

export function createSessionCookie(token: string) {
  return [
    `${cookieName}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ].join("; ");
}

export function clearSessionCookie() {
  return [`${cookieName}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"].join("; ");
}

export function readCookie(header: string | undefined, name: string) {
  if (!header) {
    return null;
  }

  const cookies = header.split(";").map((cookie) => cookie.trim());
  const match = cookies.find((cookie) => cookie.startsWith(`${name}=`));

  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}
