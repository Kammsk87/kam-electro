import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const ADMIN_USER = process.env.ADMIN_USER || "host";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "quiz1723";

export function proxy(request: NextRequest) {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Basic ")) {
    const decoded = Buffer.from(authHeader.slice(6), "base64").toString();
    const separatorIndex = decoded.indexOf(":");
    const user = decoded.slice(0, separatorIndex);
    const password = decoded.slice(separatorIndex + 1);
    if (user === ADMIN_USER && password === ADMIN_PASSWORD) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="quiz-host"' },
  });
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/control/:path*",
    "/api/questions/:path*",
    "/api/packs/:path*",
    "/api/games/:path*",
  ],
};
