// =============================================================
// COMPLEXO DMC · Throttle em memória por IP (janela deslizante)
// Mesmo padrão do throttleAuth do server.js, só que parametrizado
// para ser reaproveitado (hoje: POST /api/contato).
//
// Em serverless (Vercel) cada instância tem o próprio mapa: é um
// freio de abuso, não um limite global garantido. O IP vem de
// req.ip, que depende do 'trust proxy' configurado no server.js.
//
// Portal (PORTAL-API §4.16 · F0a) — dois parâmetros OPCIONAIS:
//   chave(req)  agrupa por outra chave (ex.: 'u:' + userId); padrão = IP;
//   codigo      acrescenta { codigo } ao corpo do 429.
// Sem eles, comportamento e resposta ficam idênticos aos de antes.
// =============================================================

const chavePorIp = req => req.ip || 'desconhecido';

export function criarThrottle({
  janelaMs,
  max,
  mensagem = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  agora = Date.now,
  chave = chavePorIp,
  codigo
}) {
  const hits = new Map();

  function throttle(req, res, next) {
    const k = String(chave(req) || 'desconhecido');
    const t = agora();
    const recentes = (hits.get(k) || []).filter(h => t - h < janelaMs);
    if (recentes.length >= max) {
      const segundos = Math.max(1, Math.ceil((janelaMs - (t - recentes[0])) / 1000));
      res.set('Retry-After', String(segundos));
      return res.status(429).json(codigo ? { error: mensagem, codigo } : { error: mensagem });
    }
    recentes.push(t);
    hits.set(k, recentes);
    next();
  }

  // Varredura periódica para o mapa não crescer com IPs que já saíram da janela.
  const limpeza = setInterval(() => {
    const t = agora();
    for (const [k, lista] of hits) {
      const vivos = lista.filter(h => t - h < janelaMs);
      if (vivos.length) hits.set(k, vivos);
      else hits.delete(k);
    }
  }, janelaMs);
  limpeza.unref?.();

  throttle.limpar = () => hits.clear();
  return throttle;
}
