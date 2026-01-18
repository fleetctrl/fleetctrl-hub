import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

// Routes that don't require authentication
const publicRoutes = ["/", "/sign-in", "/sign-up"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API routes
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // Check if this is a public route
  const isPublicRoute = publicRoutes.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`)
  );

  // Check if this is an admin route
  const isAdminRoute = pathname.startsWith("/admin");

  // Check for session cookie - BetterAuth stores session in cookies
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("better-auth.session_token");
  const isAuthenticated = !!sessionCookie?.value;

  // Redirect authenticated users away from sign-in/sign-up pages
  if (isAuthenticated && (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up"))) {
    return NextResponse.redirect(new URL("/admin", request.url));
  }

  // Protect admin routes
  if (isAdminRoute && !isAuthenticated) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Match all routes except static assets
  matcher: ["/((?!.*\\..*|_next).*)", "/"],
};
