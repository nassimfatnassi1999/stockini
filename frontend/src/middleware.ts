import { NextResponse } from 'next/server';

export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Protège toutes les routes sauf :
     * - tous les chemins internes Next.js (_next/*)
     * - favicon.ico, assets/* et images/*
     * - tous les fichiers statiques avec extension
     */
    '/((?!_next(?:/|$)|favicon\\.ico$|assets(?:/|$)|images(?:/|$)|.*\\.[^/]+$).*)',
  ],
};
