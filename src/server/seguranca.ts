import { createMiddleware } from "hono/factory";

// CSP: somente a própria origem. O build do Vite gera scripts e CSS em arquivos
// externos (sem inline), por isso 'unsafe-inline' não é necessário em script-src.
// style-src permite 'unsafe-inline' apenas para o atributo style do React.
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export const cabecalhosDeSeguranca = createMiddleware(async (c, next) => {
  await next();
  // Cria nova resposta caso os cabeçalhos sejam imutáveis (resposta vinda de fetch/assets).
  const resposta = new Response(c.res.body, c.res);
  resposta.headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  resposta.headers.set("Content-Security-Policy", CSP);
  resposta.headers.set("X-Content-Type-Options", "nosniff");
  resposta.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  resposta.headers.set("X-Frame-Options", "DENY");
  c.res = resposta;
});
