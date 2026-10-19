import { NextResponse, type NextRequest } from 'next/server';

/** Sem cookie de sessão, áreas autenticadas vão para o login (a API continua validando tudo). */
export function proxy(request: NextRequest) {
  const hasSession = request.cookies.has('pn_session');
  if (!hasSession) {
    const url = request.nextUrl.clone();
    url.pathname = '/entrar';
    url.search = `?voltar=${encodeURIComponent(request.nextUrl.pathname)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ['/app/:path*', '/painel/:path*'] };
