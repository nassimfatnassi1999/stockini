import { NextResponse } from 'next/server';

export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Protège toutes les routes sauf :
     * - _next/static, _next/image, favicon.ico
     * - fichiers avec extension (images, fonts…)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
