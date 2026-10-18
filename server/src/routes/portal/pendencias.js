// =============================================================
// COMPLEXO DMC · Portal — pendências do titular (faixa de avisos)
// PORTAL-API §6.4 (GET /portal/me/pendencias), §4.4 (grupo `aviso`) · dono: F0t.
//
// Junta o grupo `aviso` (obrigatórios primeiro) e os contadores de id fixo:
// fatia ausente → contador `null` (nunca 0 inventado, D7). Avisos da F0t:
// `troca-de-senha`, `email-nao-verificado` (só com e-mail transacional
// configurado; dispensável) e `2fa-obrigatorio` (admin com PORTAL_2FA=1 sem
// 2FA). O `perfil-incompleto` é registrado pelo módulo do perfil.
// =============================================================
import { executarAvisos } from '../../portal/servicos.js';
import { papelDe } from '../../portal/papeis.js';

export function criarAvisosDaConta({ configPortal = {}, email = null } = {}) {
  return [
    {
      id: 'troca-de-senha',
      async gerar(req) {
        if (req?.user?.senhaTemporaria !== true) return [];
        return [{ id: 'troca-de-senha', tom: 'erro', texto: 'Defina uma nova senha para continuar usando a plataforma.', href: 'perfil.html#seguranca', rotulo: 'Definir senha', dispensavel: false }];
      }
    },
    {
      id: 'email-nao-verificado',
      async gerar(req) {
        if (!req?.user || req.user.emailVerificadoEm) return [];
        if (!(email && email.disponivel && configPortal.baseUrl)) return [];
        return [{ id: 'email-nao-verificado', tom: 'info', texto: 'Confirme o seu e-mail para receber avisos e recuperar o acesso.', href: 'perfil.html#contato', rotulo: 'Confirmar e-mail', dispensavel: true }];
      }
    },
    {
      id: '2fa-obrigatorio',
      async gerar(req) {
        if (configPortal.doisFatores !== true || papelDe(req?.user) !== 'admin' || req.user.doisFatoresAtivo === true) return [];
        return [{ id: '2fa-obrigatorio', tom: 'aviso', texto: 'Ative a verificação em duas etapas para usar a área da coordenação.', href: 'perfil.html#seguranca', rotulo: 'Ativar agora', dispensavel: false }];
      }
    }
  ];
}

/**
 * @param {{ router, repo, servicos, log? }} deps — `servicos` lê o grupo `aviso` na hora da requisição.
 */
export function criarRotaPendencias({ router, repo, servicos, log = console } = {}) {
  if (!router || typeof repo !== 'function' || !servicos) throw new TypeError('criarRotaPendencias: informe router, repo e servicos.');
  router.get('/me/pendencias', async (req, res) => {
    const { avisos, contadores } = await executarAvisos(servicos, req, { log });
    let notificacoesNaoLidas = null;
    try {
      notificacoesNaoLidas = await repo('notificacoes').countDocuments({ userId: String(req.user._id), lida: false });
    } catch (err) {
      try { (log.warn || log.error).call(log, `[portal] pendências: contagem de notificações indisponível (${err?.name || 'erro'})`); } catch { /* nada */ }
    }
    res.json({ avisos, contadores: { ...contadores, notificacoesNaoLidas } });
  });
  return router;
}

/** Montagem no agregador (API §5.1). */
export default async function montar(ctx) {
  const c = ctx.comum;
  for (const def of criarAvisosDaConta({ configPortal: c.configPortal, email: c.email })) ctx.servicos.adicionar('aviso', def);
  const leitor = Object.freeze({ tentar: n => ctx.servicos.tentar(n), obter: n => ctx.servicos.obter(n), todos: g => [...new Set(ctx.servicos.todos(g))] });
  criarRotaPendencias({ router: ctx.rotas.aluno, repo: c.repo, servicos: leitor, log: c.log });
}
