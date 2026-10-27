import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

// Routes that don't require authentication
const publicRoutes = ["/sign-in", "/sign-up"];

/**
 * Optimistic check only: a request without a Better Auth session cookie is sent to sign-in.
 * The API validates the session on every admin request. Authenticated users are not redirected
 * away from /sign-in here (a stale cookie would loop); the sign-in page does that itself.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );

  if (!isPublicRoute && !getSessionCookie(request)) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // All pages except static assets and the API/auth paths served by the API service.
  matcher: ["/((?!api(?:/|$)|auth(?:/|$)|_next|.*\\..*).*)", "/"],
};
