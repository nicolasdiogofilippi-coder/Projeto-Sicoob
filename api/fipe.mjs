// Vercel Function: repassa consultas à tabela FIPE gratuita (fipe.api.br) e guarda em cache por 1 dia.
// O cache faz várias fichas usarem a mesma resposta, economizando o limite grátis (500 consultas/dia,
// ou 1.000/dia criando um token grátis em fipe.api.br/register e cadastrando FIPE_TOKEN na Vercel).
export default async function handler(req, res) {
  const p = String((req.query && req.query.p) || new URL(req.url, 'http://x').searchParams.get('p') || '');
  if (!/^\/(cars|motorcycles|trucks)(\/[A-Za-z0-9-]{1,20}){0,5}$/.test(p)) {
    res.statusCode = 400; res.setHeader('Content-Type', 'application/json'); return res.end('{"erro":"Caminho inválido"}');
  }
  const headers = { Accept: 'application/json' };
  if (process.env.FIPE_TOKEN) headers.Authorization = 'Bearer ' + process.env.FIPE_TOKEN;
  try {
    const r = await fetch('https://fipe.api.br/api/v2' + p, { headers, signal: AbortSignal.timeout(15000) });
    const corpo = await r.text();
    res.statusCode = r.status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (r.ok) res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.end(corpo);
  } catch (e) {
    res.statusCode = 504; res.setHeader('Content-Type', 'application/json');
    res.end('{"erro":"A tabela FIPE não respondeu. Tente de novo."}');
  }
}
