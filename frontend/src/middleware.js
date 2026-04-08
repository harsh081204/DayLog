import { NextResponse } from 'next/server';

// 1. Specify which paths are protected
const protectedRoutes = ['/journal', '/profile'];
const authRoutes = ['/login', '/signup'];

export function middleware(request) {
    // BYPASSING MIDDLEWARE FOR TESTING
    return NextResponse.next();
}

// 5. Config to avoid running on static files/api
export const config = {
    matcher: [
        /*
         * Match all request paths except for the ones starting with:
         * - api (API routes)
         * - _next/static (static files)
         * - _next/image (image optimization files)
         * - favicon.ico (favicon file)
         */
        '/((?!api|_next/static|_next/image|favicon.ico).*)',
    ],
};

export default middleware;
