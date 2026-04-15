import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated as betterAuthIsAuthenticated } from "@/lib/auth-server";

// Routes that don't require authentication
const publicRoutes = ["/", "/sign-in", "/sign-up"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API routes
  if (pathname.startsWith("/api")) {
    return NextResponse.next();
  }

  // // Check if this is a public route
  // const isPublicRoute = publicRoutes.some(
  //   (route) => pathname === route || pathname.startsWith(`${route}/`)
  // );

  // Check if this is an admin route
  const isAdminRoute = pathname.startsWith("/admin");

  // If it's an admin route, check authentication
  const isAuthenticated = await betterAuthIsAuthenticated();

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
