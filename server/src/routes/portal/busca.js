// =============================================================
// COMPLEXO DMC · Portal — busca global no servidor (com filtros)
// PORTAL-API §6.4 (GET /portal/busca), §4.4 (grupo `busca`) · dono: F0t.
//
// Termos por `regexBusca` (2–80 caracteres, até 5 palavras, ESCAPADOS,
// sem acento e sem caixa; E entre as palavras). Os provedores são das
// fatias donas (F1a cursos/aulas, F4b documentos, F6a atendimentos, F7
// publicações): grupo sem permissão para o papel é OMITIDO; provedor que
// falha também (com aviso no log). `href` sempre interno.
// =============================================================
import { ErroPortal, MENSAGENS } from '../../portal/erros.js';
import { regexBusca } from '../../portal/validacao.js';
import { executarBusca } from '../../portal/servicos.js';
import { chaveUsuario } from '../../portal/limitador.js';

export const TIPOS_BUSCA = Object.freeze(['cursos', 'aulas', 'publicacoes', 'atendimentos', 'documentos']);

/**
 * @param {{ router, servicos, throttle, log? }} deps
 */
export function criarRotaBusca({ router, servicos, throttle, log = console } = {}) {
  if (!router || !servicos || typeof throttle !== 'function') throw new TypeError('criarRotaBusca: informe router, servicos e throttle.');
  const lim = throttle({ janelaMs: 60 * 1000, max: 30, chave: chaveUsuario, codigo: 'limite', mensagem: MENSAGENS.limite });

  router.get('/busca', lim, async (req, res) => {
    const q = req.query?.q;
    if (typeof q !== 'string') throw new ErroPortal(400, 'validacao', undefined, { campos: { q: 'Digite pelo menos 2 caracteres.' } });
    const termos = regexBusca(q);
    if (!termos) throw new ErroPortal(400, 'validacao', undefined, { campos: { q: 'Use de 2 a 80 caracteres.' } });
    let tipos = null;
    if (req.query.tipos !== undefined) {
      if (typeof req.query.tipos !== 'string') throw new ErroPortal(400, 'formato-invalido');
      tipos = [...new Set(req.query.tipos.split(',').map(s => s.trim()).filter(Boolean))];
      if (!tipos.length || tipos.some(t => !TIPOS_BUSCA.includes(t))) throw new ErroPortal(400, 'validacao', undefined, { campos: { tipos: 'Tipo de busca desconhecido.' } });
    }
    let limite = 5;
    if (req.query.limite !== undefined) {
      const n = typeof req.query.limite === 'string' && /^\d{1,2}$/.test(req.query.limite) ? Number(req.query.limite) : NaN;
      if (!(n >= 1 && n <= 20)) throw new ErroPortal(400, 'validacao', undefined, { campos: { limite: 'Use um valor entre 1 e 20.' } });
      limite = n;
    }
    let pagina = 1;
    if (req.query.pagina !== undefined) {
      if (!tipos || tipos.length !== 1) throw new ErroPortal(400, 'validacao', undefined, { campos: { pagina: 'A paginação vale só com um tipo.' } });
      const n = typeof req.query.pagina === 'string' && /^\d{1,4}$/.test(req.query.pagina) ? Number(req.query.pagina) : NaN;
      pagina = n >= 1 ? n : 1;
    }
    const grupos = await executarBusca(servicos, req, termos, { tipos, limite, pagina, log });
    res.json({ q: q.trim().replace(/\s+/g, ' ').slice(0, 80), grupos });
  });
  return router;
}

/** Montagem no agregador (API §5.1). */
export default async function montar(ctx) {
  const c = ctx.comum;
  const leitor = Object.freeze({ tentar: n => ctx.servicos.tentar(n), obter: n => ctx.servicos.obter(n), todos: g => [...new Set(ctx.servicos.todos(g))] });
  criarRotaBusca({ router: ctx.rotas.aluno, servicos: leitor, throttle: c.throttle, log: c.log });
}
