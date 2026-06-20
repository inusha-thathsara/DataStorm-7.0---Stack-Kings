import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import type { NextFetchEvent, NextRequest } from "next/server";
import { isAuthBypassed } from "@/lib/auth/config";

const isPublicRoute = createRouteMatcher([
  "/api/health(.*)",
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const clerkProtect = clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth().protect();
  }
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (isAuthBypassed()) {
    return NextResponse.next();
  }
  return clerkProtect(req, event);
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
