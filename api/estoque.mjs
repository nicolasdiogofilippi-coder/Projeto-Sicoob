// Vercel Function: busca um carro do estoque da Nick no AutoConf pela placa.
// As chaves ficam nas variáveis AUTOCONF_TOKEN e AUTOCONF_AUTH da Vercel (nunca no navegador).
// Só usuários logados no site com perfil F&I conseguem consultar.

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lhvgbmixwrhybdovgtwo.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_KEY || 'sb_publishable_x0WFxAWbyJ_Zt638jZTwzA_lf1Ee1kF';

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function lerCorpo(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  let raw = '';
  for await (const parte of req) raw += parte;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

async function papelDoUsuario(token) {
  if (!token) return null;
  const h = { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + token };
  const u = await fetch(SUPABASE_URL + '/auth/v1/user', { headers: h });
  if (!u.ok) return null;
  const p = await fetch(SUPABASE_URL + '/rest/v1/perfis?select=papel', { headers: h });
  if (!p.ok) return null;
  const linhas = await p.json();
  return Array.isArray(linhas) && linhas[0] ? linhas[0].papel : null;
}

// Guarda o estoque por 5 minutos para não consultar o AutoConf a cada ficha
let cache = { em: 0, veiculos: null };
async function estoque() {
  if (cache.veiculos && Date.now() - cache.em < 5 * 60 * 1000) return cache.veiculos;
  const todos = [];
  for (let pagina = 1; pagina <= 20; pagina++) {
    const r = await fetch('https://api.autoconf.com.br/api/v1/veiculos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authorization: process.env.AUTOCONF_AUTH },
      body: JSON.stringify({ token: process.env.AUTOCONF_TOKEN, pagina, registros_por_pagina: 500 }),
      signal: AbortSignal.timeout(20000)
    });
    if (r.status === 403) throw Object.assign(new Error('O AutoConf recusou o acesso: confira AUTOCONF_TOKEN e AUTOCONF_AUTH na Vercel.'), { status: 502 });
    if (!r.ok) throw Object.assign(new Error('O AutoConf não respondeu (' + r.status + ').'), { status: 502 });
    const d = await r.json();
    todos.push(...(d.veiculos || []));
    if (!d.ultima_pagina || pagina >= d.ultima_pagina) break;
  }
  cache = { em: Date.now(), veiculos: todos };
  return todos;
}

const limpa = p => String(p || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { erro: 'Use POST.' });
  if (!process.env.AUTOCONF_TOKEN || !process.env.AUTOCONF_AUTH) return json(res, 500, { erro: 'A consulta ao estoque ainda não foi configurada: faltam AUTOCONF_TOKEN e AUTOCONF_AUTH na Vercel.' });

  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const papel = await papelDoUsuario(token).catch(() => null);
  if (papel !== 'fi') return json(res, 401, { erro: 'Faça login como F&I para consultar o estoque.' });

  const { placa } = await lerCorpo(req);
  const p = limpa(placa);
  if (!/^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(p)) return json(res, 422, { erro: 'Placa inválida. Use o formato ABC1D23 ou ABC1234.' });

  let lista;
  try { lista = await estoque(); } catch (e) { return json(res, e.status || 502, { erro: e.message }); }
  const v = lista.find(x => limpa(x.placa_completa) === p);
  if (!v) return json(res, 404, { erro: 'Placa não encontrada no estoque do AutoConf (o carro precisa estar publicado no estoque).' });

  return json(res, 200, {
    placa: limpa(v.placa_completa),
    marca: v.marca_nome || '',
    modelo: v.modelo_nome || '',
    ano_fabricacao: v.anofabricacao || null,
    ano_modelo: v.anomodelo || null,
    fipe: v.valor_fipe != null ? Number(v.valor_fipe) : null,
    fipe_codigo: v.fipe_codigo || null,
    cor: v.cor_nome || null,
    km: v.km ?? null,
    valor_venda: v.valorvenda != null ? Number(v.valorvenda) : null,
    loja: v.revenda_nome || null,
    atualizado_em: v.atualizacao || null
  });
}
