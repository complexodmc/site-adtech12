// =============================================================
// COMPLEXO DMC · Portal — notificações (coleções `notificacoes` e
// `notificacoes_estado`)
// PORTAL-API §3.3, §3.5, §4.4, §4.9 · dono: F0m.
//
// - emitir({ userIds, tipo, titulo, texto, link, entidade, chave }):
//   insertMany({ ordered:false }); com `chave`, o índice parcial
//   `uq_not_chave` {userId, chave} faz o dedupe (E11000 ignorado:
//   emitir de novo é idempotente). NUNCA lança para quem chamou: falha
//   vira `{ inseridas: 0 }` e uma linha de log sem dado pessoal.
// - varrer(userId): roda o grupo `notificacaoSobDemanda` no máximo a
//   cada 5 min por usuário (sem cron: funciona na Vercel); a "vez" é
//   tomada de forma atômica em `notificacoes_estado`, então duas
//   requisições simultâneas não varrem duas vezes.
//
// Textos fixos e sóbrios são do chamador (catálogo §3.5); aqui só se
// aplicam os tetos (título 100, texto 280) e o link interno validado.
// Serviço que grava com índice único: espera `garantia.garantir()`
// antes da primeira escrita da instância (API §4.4).
// =============================================================
import { resumirErro } from './erros.js';
import { validarLinkInterno } from './validacao.js';

export const TIPO_NOTIFICACAO_RE = /^[a-z][a-z_]*\.[a-z][a-z_]*$/;
export const INTERVALO_VARREDURA_MS = 5 * 60 * 1000;
export const RETENCAO_PADRAO_DIAS = 180;
const DIA_MS = 24 * 60 * 60 * 1000;

const cortar = (v, max) => {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
};

function ehDuplicado(err) {
  if (!err) return false;
  if (err.code === 11000) return true;
  return Array.isArray(err.writeErrors) && err.writeErrors.length > 0 && err.writeErrors.every(w => (w.code ?? w.err?.code) === 11000);
}

function quantasInseridas(err, total) {
  const r = err?.result;
  const n = err?.insertedCount ?? r?.insertedCount ?? r?.nInserted ?? r?.result?.nInserted;
  if (Number.isFinite(n)) return n;
  const falhas = Array.isArray(err?.writeErrors) ? err.writeErrors.length : total;
  return Math.max(0, total - falhas);
}

/**
 * @param {{ repo: (nome: string) => object, servicos?: object, agora?: () => Date, log?: Console,
 *   retencaoDias?: () => Promise<number>, garantia?: { garantir: () => Promise<void> } }} deps
 */
export function criarServicoNotificacoes({
  repo, servicos = null, agora = () => new Date(), log = console, retencaoDias = async () => RETENCAO_PADRAO_DIAS, garantia = null
} = {}) {
  if (typeof repo !== 'function') throw new TypeError('criarServicoNotificacoes: informe repo(nome).');
  let indicesProntos = false;

  const logar = (texto, err, nivel = 'warn') => {
    try {
      const r = err ? resumirErro(err) : null;
      (log[nivel] || log.error).call(log, JSON.stringify({ nivel: nivel === 'warn' ? 'aviso' : 'erro', evento: 'portal.notificacoes', texto, ...(r ? { erroResumido: r } : {}) }));
    } catch { /* nada */ }
  };

  async function dias() {
    try {
      const d = Number(await retencaoDias());
      return Number.isFinite(d) && d >= 1 ? Math.min(d, 3650) : RETENCAO_PADRAO_DIAS;
    } catch {
      return RETENCAO_PADRAO_DIAS;
    }
  }

  /** → { inseridas:N }. Nunca lança. */
  async function emitir({ userIds, tipo, titulo, texto, link = null, entidade = null, chave = null } = {}) {
    try {
      if (typeof tipo !== 'string' || !TIPO_NOTIFICACAO_RE.test(tipo)) { logar(`tipo de notificação inválido (${String(tipo)})`); return { inseridas: 0 }; }
      const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(v => v !== null && v !== undefined && String(v)).map(String))];
      if (!ids.length) return { inseridas: 0 };
      const t = cortar(titulo, 100);
      if (!t) { logar(`notificação ${tipo} sem título`); return { inseridas: 0 }; }
      let l = null;
      if (link !== null && link !== undefined) {
        l = validarLinkInterno(link);
        if (!l) logar(`notificação ${tipo} com link fora do padrão interno (descartado)`);
      }
      const ent = entidade && typeof entidade === 'object' && entidade.tipo ? { tipo: String(entidade.tipo), id: String(entidade.id ?? '') } : null;
      const k = typeof chave === 'string' && chave.trim() ? chave.trim().slice(0, 200) : null;

      if (garantia && !indicesProntos) {
        await garantia.garantir();
        indicesProntos = true;
      }
      const criadaEm = agora();
      const expiraEm = new Date(criadaEm.getTime() + (await dias()) * DIA_MS);
      const docs = ids.map(userId => ({
        userId, tipo, titulo: t, texto: cortar(texto, 280), link: l, entidade: ent, chave: k,
        lida: false, lidaEm: null, criadaEm, expiraEm
      }));
      try {
        const r = await repo('notificacoes').insertMany(docs, { ordered: false });
        return { inseridas: Number(r?.insertedCount ?? docs.length) };
      } catch (err) {
        if (ehDuplicado(err)) return { inseridas: quantasInseridas(err, docs.length) };
        throw err;
      }
    } catch (err) {
      logar(`notificação ${String(tipo)} não gravada`, err, 'error');
      return { inseridas: 0 };
    }
  }

  /** Toma a vez de varrer (atômico). true = esta chamada varre agora. */
  async function tomarVez(userId, agoraData) {
    const limite = new Date(agoraData.getTime() - INTERVALO_VARREDURA_MS);
    try {
      const r = await repo('notificacoes_estado').findOneAndUpdate(
        { _id: userId, $or: [{ ultimaVarreduraEm: { $lt: limite } }, { ultimaVarreduraEm: null }] },
        { $set: { ultimaVarreduraEm: agoraData } },
        { upsert: true, returnDocument: 'after' }
      );
      return !!r;
    } catch (err) {
      // O documento existe e a última varredura é recente: o upsert tentou inserir o mesmo _id.
      if (err?.code === 11000) return false;
      throw err;
    }
  }

  /** Roda o grupo `notificacaoSobDemanda` no máx. a cada 5 min por usuário. Nunca lança. */
  async function varrer(userId) {
    try {
      const u = userId === null || userId === undefined ? '' : String(userId);
      if (!u) return;
      const defs = servicos ? servicos.todos('notificacaoSobDemanda') : [];
      if (!defs.length) return;
      const agoraData = agora();
      if (!(await tomarVez(u, agoraData))) return;
      for (const d of defs) {
        try {
          await d.gerar(u, { agora: agoraData, emitir });
        } catch (err) {
          logar(`gerador sob demanda ${d.tipo} falhou`, err);
        }
      }
    } catch (err) {
      logar('varredura de notificações não executada', err);
    }
  }

  return Object.freeze({ emitir, varrer });
}
