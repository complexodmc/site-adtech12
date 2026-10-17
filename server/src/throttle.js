// =============================================================
// COMPLEXO DMC · Throttle em memória por IP (janela deslizante)
// Mesmo padrão do throttleAuth do server.js, só que parametrizado
// para ser reaproveitado (hoje: POST /api/contato).
//
// Em serverless (Vercel) cada instância tem o próprio mapa: é um
// freio de abuso, não um limite global garantido. O IP vem de
// req.ip, que depende do 'trust proxy' configurado no server.js.
// =============================================================

export function criarThrottle({
  janelaMs,
  max,
  mensagem = 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',
  agora = Date.now
}) {
  const hits = new Map();

  function throttle(req, res, next) {
    const ip = req.ip || 'desconhecido';
    const t = agora();
    const recentes = (hits.get(ip) || []).filter(h => t - h < janelaMs);
    if (recentes.length >= max) {
      const segundos = Math.max(1, Math.ceil((janelaMs - (t - recentes[0])) / 1000));
      res.set('Retry-After', String(segundos));
      return res.status(429).json({ error: mensagem });
    }
    recentes.push(t);
    hits.set(ip, recentes);
    next();
  }

  // Varredura periódica para o mapa não crescer com IPs que já saíram da janela.
  const limpeza = setInterval(() => {
    const t = agora();
    for (const [ip, lista] of hits) {
      const vivos = lista.filter(h => t - h < janelaMs);
      if (vivos.length) hits.set(ip, vivos);
      else hits.delete(ip);
    }
  }, janelaMs);
  limpeza.unref?.();

  throttle.limpar = () => hits.clear();
  return throttle;
}
