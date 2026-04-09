import { NextResponse } from 'next/server';

// 1. Specify which paths are protected
const protectedRoutes = ['/journal', '/profile'];
const authRoutes = ['/login', '/signup'];

export function middleware(request) {
    const token = request.cookies.get('token');
    const path = request.nextUrl.pathname;

    const isProtectedRoute = protectedRoutes.some(route => path.startsWith(route));
    const isAuthRoute = authRoutes.includes(path);

    if (isProtectedRoute && !token) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    if (isAuthRoute && token) {
        return NextResponse.redirect(new URL('/journal', request.url));
    }

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
