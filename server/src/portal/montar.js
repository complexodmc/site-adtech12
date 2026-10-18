// =============================================================
// COMPLEXO DMC · Portal — agregador único (/api/auth/* e /api/portal/*)
// PORTAL-API §5.1–§5.3 · índice §3.4, §8.3 · DC-67, DC-74, DC-75 · dono: F0m.
//
// server.js (só a sessão principal, três pontos — §5.3):
//   import { montarPortal, tratarErroGlobal } from './portal/montar.js';
//   app.use('/api', montarPortal());      // antes de /api/liberacoes
//   app.use(tratarErroGlobal);            // no lugar do handler anônimo
//
// Garantias:
// - MODULOS_PADRAO: um `import()` com especificador LITERAL por entrada
//   (o empacotador da Vercel rastreia o arquivo); nunca import(variavel).
// - Isolamento por módulo (sempre, exceto com `falharCedo`): arquivo
//   ausente, erro no import(), exceção no montar(ctx) ou nome de serviço
//   repetido deixam SÓ aquele módulo de fora — inteiro (nenhuma rota,
//   serviço ou grupo dele). Login, catálogo e o resto do LMS seguem (D5).
// - montar(ctx) roda UMA vez por processo (carga memorizada); a garantia
//   de índices é separada e pode ser repetida depois de falha de rede.
// - Rotas legadas que passam pelo agregador esperam só a carga, nunca os
//   índices (disparados em segundo plano); /auth/* e /portal/* esperam.
// - `falharCedo` (NODE_ENV=test ou opção do teste): a falha relança e o
//   agregador responde 500 — o teste da fatia acusa o erro na hora.
// =============================================================
import { Router } from 'express';
import { getDb as getDbPadrao } from '../db.js';
import { config } from '../config.js';
import { requireAuth, requireAdmin, hashSenha, checkSenha, signToken, publicUser } from '../auth.js';
import { capaUrl } from '../routes/capas.js';
import { criarThrottle } from '../throttle.js';
import * as csv from './csv.js';
import { configPortal as configPortalPadrao, avisosDeConfiguracao } from './config-portal.js';
import { configurarCripto } from './cripto.js';
import { idDaRequisicao, semCache, criarTratadorErroPortal, criarRegistroDeErros, resumirErro } from './erros.js';
import { servicos as servicosDoProcesso, criarLoteDeServicos } from './servicos.js';
import { criarGarantiaIndices, registrarIndices, especificacoesRegistradas } from './indices.js';
import { criarAcesso, exigirPapel, exigirSegundoFatorAdmin, exigirTrocaDeSenha } from './acesso.js';
import { criarPerfisLeitura } from './perfis-leitura.js';
import { criarAuditoria } from './auditoria.js';
import { criarServicoNotificacoes, RETENCAO_PADRAO_DIAS } from './notificacoes.js';
import { criarArquivos } from './arquivos.js';
import { criarEnviadorEmail } from './email.js';
import { criarContadorPersistente } from './limitador.js';

export { resumirErro, tratarErroGlobal } from './erros.js';
export { exigirTrocaDeSenha, exigirSegundoFatorAdmin, exigirPapel } from './acesso.js';

/**
 * Os 27 módulos de rota (API §5.1). `fatia` = dono no índice §8.1 (só os testes o leem,
 * para a varredura por QA_FATIA — DC-75). Ordem = ordem de montagem.
 */
export const MODULOS_PADRAO = Object.freeze([
  // F0t (os 9 que PORTAL_MODULOS sempre soma)
  Object.freeze({ caminho: 'routes/portal/auth-extra.js', fatia: 'F0t', importar: () => import('../routes/portal/auth-extra.js') }),
  Object.freeze({ caminho: 'routes/portal/perfil.js', fatia: 'F0t', importar: () => import('../routes/portal/perfil.js') }),
  Object.freeze({ caminho: 'routes/portal/meus-dados.js', fatia: 'F0t', importar: () => import('../routes/portal/meus-dados.js') }),
  Object.freeze({ caminho: 'routes/portal/cep.js', fatia: 'F0t', importar: () => import('../routes/portal/cep.js') }),
  Object.freeze({ caminho: 'routes/portal/notificacoes.js', fatia: 'F0t', importar: () => import('../routes/portal/notificacoes.js') }),
  Object.freeze({ caminho: 'routes/portal/busca.js', fatia: 'F0t', importar: () => import('../routes/portal/busca.js') }),
  Object.freeze({ caminho: 'routes/portal/auditoria.js', fatia: 'F0t', importar: () => import('../routes/portal/auditoria.js') }),
  Object.freeze({ caminho: 'routes/portal/pendencias.js', fatia: 'F0t', importar: () => import('../routes/portal/pendencias.js') }),
  Object.freeze({ caminho: 'routes/portal-equipe.js', fatia: 'F0t', importar: () => import('../routes/portal-equipe.js') }),
  // F1a
  Object.freeze({ caminho: 'routes/portal-conteudo.js', fatia: 'F1a', importar: () => import('../routes/portal-conteudo.js') }),
  // F2
  Object.freeze({ caminho: 'routes/portal-avaliacoes.js', fatia: 'F2', importar: () => import('../routes/portal-avaliacoes.js') }),
  // F3a
  Object.freeze({ caminho: 'routes/portal-academico.js', fatia: 'F3a', importar: () => import('../routes/portal-academico.js') }),
  Object.freeze({ caminho: 'routes/portal-encontros.js', fatia: 'F3a', importar: () => import('../routes/portal-encontros.js') }),
  // F3b
  Object.freeze({ caminho: 'routes/portal-cursos.js', fatia: 'F3b', importar: () => import('../routes/portal-cursos.js') }),
  Object.freeze({ caminho: 'routes/portal-declaracoes.js', fatia: 'F3b', importar: () => import('../routes/portal-declaracoes.js') }),
  // F4a
  Object.freeze({ caminho: 'routes/portal-turmas.js', fatia: 'F4a', importar: () => import('../routes/portal-turmas.js') }),
  // F4b
  Object.freeze({ caminho: 'routes/portal/documentos.js', fatia: 'F4b', importar: () => import('../routes/portal/documentos.js') }),
  Object.freeze({ caminho: 'routes/portal/contratos.js', fatia: 'F4b', importar: () => import('../routes/portal/contratos.js') }),
  // F5
  Object.freeze({ caminho: 'routes/portal/financeiro.js', fatia: 'F5', importar: () => import('../routes/portal/financeiro.js') }),
  // F6a
  Object.freeze({ caminho: 'routes/portal/atendimento.js', fatia: 'F6a', importar: () => import('../routes/portal/atendimento.js') }),
  Object.freeze({ caminho: 'routes/portal/ouvidoria.js', fatia: 'F6a', importar: () => import('../routes/portal/ouvidoria.js') }),
  Object.freeze({ caminho: 'routes/portal/configuracoes.js', fatia: 'F6a', importar: () => import('../routes/portal/configuracoes.js') }),
  // F6b
  Object.freeze({ caminho: 'routes/portal/ia.js', fatia: 'F6b', importar: () => import('../routes/portal/ia.js') }),
  // F7
  Object.freeze({ caminho: 'routes/portal/publicacoes.js', fatia: 'F7', importar: () => import('../routes/portal/publicacoes.js') }),
  Object.freeze({ caminho: 'routes/portal/banners.js', fatia: 'F7', importar: () => import('../routes/portal/banners.js') }),
  Object.freeze({ caminho: 'routes/portal/relatorios.js', fatia: 'F7', importar: () => import('../routes/portal/relatorios.js') }),
  // F8
  Object.freeze({ caminho: 'routes/portal-professor.js', fatia: 'F8', importar: () => import('../routes/portal-professor.js') })
]);

/** Os 9 módulos da F0t que `PORTAL_MODULOS` sempre soma (API §5.2; "os da F0a" antes da D-59). */
export const MODULOS_SEMPRE = Object.freeze(MODULOS_PADRAO.filter(m => m.fatia === 'F0t').map(m => m.caminho));

/** Prefixo (relativo a /api) de cada Router de `ctx.rotas`. */
export const PREFIXOS_ROTAS = Object.freeze({
  auth: '/auth', publico: '/portal', aluno: '/portal', professor: '/portal/professor', admin: '/portal/admin'
});

/**
 * Aplica o filtro de módulos (só existe com a regra QA_SERVIDOR, D-41): com `so`, monta esses +
 * os 9 da F0t; `ignorar` vale depois, inclusive sobre os que `so` sempre soma (D-62).
 */
export function aplicarFiltroDeModulos(modulos, filtro) {
  const so = Array.isArray(filtro?.so) && filtro.so.length ? new Set([...filtro.so, ...MODULOS_SEMPRE]) : null;
  const ignorar = new Set(Array.isArray(filtro?.ignorar) ? filtro.ignorar : []);
  return modulos.filter(m => (!so || so.has(m.caminho)) && !ignorar.has(m.caminho));
}

/** Arquivo do PRÓPRIO módulo ausente (não um import interno dele que falhou). */
function ehModuloAusente(err, caminho) {
  if (!err || err.code !== 'ERR_MODULE_NOT_FOUND') return false;
  const alvo = String(err.message || '').split(/ imported from /)[0];
  return alvo.includes(caminho);
}

/** Lista "MÉTODO /caminho" de um Router (rotas diretas e Routers aninhados sem caminho próprio). */
export function listarRotas(router, prefixo = '') {
  const out = [];
  for (const camada of router?.stack || []) {
    if (camada.route) {
      const caminhos = Array.isArray(camada.route.path) ? camada.route.path : [camada.route.path];
      for (const metodo of Object.keys(camada.route.methods || {})) {
        for (const c of caminhos) out.push(`${metodo.toUpperCase()} ${prefixo}${c}`);
      }
    } else if (camada.handle && Array.isArray(camada.handle.stack)) {
      out.push(...listarRotas(camada.handle, prefixo));
    }
  }
  return out;
}

const criarRotasVazias = () => ({ auth: Router(), publico: Router(), aluno: Router(), professor: Router(), admin: Router() });

const NUCLEO_REGISTRADO = new WeakSet();

/**
 * Monta o agregador. Devolve o Router para `app.use('/api', …)`.
 * Opções (todas com padrão de produção): getDb, jwtSecret, exigirLogin, exigirAdmin, servicos,
 * modulos, configPortal, filtro, estrito, falharCedo, agora, log, fetchImpl.
 */
export function montarPortal(opcoes = {}) {
  const {
    getDb = getDbPadrao,
    jwtSecret = config.jwtSecret,
    exigirLogin = requireAuth,
    exigirAdmin = [requireAuth, requireAdmin],
    servicos = servicosDoProcesso,
    modulos = MODULOS_PADRAO,
    configPortal = configPortalPadrao,
    filtro = configPortal.modulosFiltro,
    estrito = configPortal.estrito,
    falharCedo = configPortal.falharCedo,
    agora = () => new Date(),
    log = console,
    fetchImpl = globalThis.fetch
  } = opcoes;

  const repo = nome => getDb().collection(nome);
  const linha = (nivel, dados) => {
    try { (nivel === 'erro' ? log.error : (log.warn || log.error)).call(log, JSON.stringify({ nivel, em: agora().toISOString(), ...dados })); } catch { /* nada */ }
  };

  // ---------- serviços comuns (núcleo) ----------
  const garantia = criarGarantiaIndices({ getDb, log });
  let cifra = null;
  try {
    cifra = configurarCripto({ material: jwtSecret, materialAnterior: configPortal.materialAnterior });
  } catch (err) {
    linha('aviso', { evento: 'portal.cifra', texto: 'cifra e selo indisponíveis (JWT_SECRET ausente)', erroResumido: resumirErro(err) });
  }
  const assinador = cifra ? cifra.assinador : null;
  const acesso = criarAcesso({ repo, servicos });
  const perfis = criarPerfisLeitura({ repo });
  const auditoria = criarAuditoria({ repo, agora, log });
  const retencaoDias = async () => {
    const f = servicos.tentar('configuracoes.retencao');
    if (typeof f !== 'function') return RETENCAO_PADRAO_DIAS;
    const r = await f();
    const d = Number(r?.notificacoesDias);
    return Number.isFinite(d) && d >= 30 && d <= 730 ? d : RETENCAO_PADRAO_DIAS;
  };
  const notificacoes = criarServicoNotificacoes({ repo, servicos, agora, log, retencaoDias, garantia });
  const arquivos = criarArquivos({ repo, agora });
  const email = criarEnviadorEmail({
    resendApiKey: configPortal.resendApiKey, de: configPortal.emailDe, url: configPortal.urlsProvedor?.resend, fetchImpl, log,
    hmac: cifra ? cifra.hmacIdentificador : undefined
  });
  const contador = criarContadorPersistente({ repo, agora });

  // ---------- estado da carga ----------
  const estado = { esperados: 0, carregados: 0, ausentes: [], falhas: [], concluida: false, rotas: {}, indices: {} };

  // ---------- registro do núcleo (uma vez por localizador) ----------
  const registrarSeAusente = (nome, impl) => {
    if (impl === null || impl === undefined) return;
    if (servicos.tentar(nome) === null) servicos.registrar(nome, impl);
  };
  if (NUCLEO_REGISTRADO.has(servicos)) {
    linha('aviso', { evento: 'portal.montagem', texto: 'montarPortal chamado de novo com o mesmo localizador; serviços do núcleo mantidos' });
  } else {
    NUCLEO_REGISTRADO.add(servicos);
    registrarSeAusente('acesso', acesso);
    registrarSeAusente('equipe.cursosDoProfessor', acesso.equipe.cursosDoProfessor);
    registrarSeAusente('equipe.docencias', acesso.equipe.docencias);
    registrarSeAusente('equipe.professoresDoCurso', acesso.equipe.professoresDoCurso);
    registrarSeAusente('perfis.publicos', perfis.publicos);
    registrarSeAusente('perfis.identificacao', perfis.identificacao);
    registrarSeAusente('auditoria', auditoria);
    registrarSeAusente('notificacoes', notificacoes);
    registrarSeAusente('arquivos', arquivos);
    registrarSeAusente('email', email);
    registrarSeAusente('cifra', cifra);
    registrarSeAusente('assinador', assinador);
    registrarSeAusente('contador', contador);
    // Contribuição do núcleo ao bloco `sistema` do painel da coordenação (API §6.11.3).
    servicos.adicionar('painel', {
      bloco: 'sistema',
      chaves: ['modulosAusentes', 'modulosComFalha', 'errosUltimas24h', 'avisosConfiguracao'],
      papeis: ['admin'],
      async contar() {
        return {
          modulosAusentes: [...estado.ausentes],
          modulosComFalha: estado.falhas.map(f => ({ caminho: f.caminho, etapa: f.etapa, erro: `${f.erro.nome}: ${f.erro.mensagem}` })),
          errosUltimas24h: await errosUltimas24h(),
          avisosConfiguracao: avisosDeConfiguracao(configPortal)
        };
      }
    });
  }

  async function errosUltimas24h() {
    // expiraEm = em + 30 dias (erros.js): "em ≥ agora − 24 h" usa o índice ttl_err.
    const limite = new Date(agora().getTime() + (30 - 1) * 24 * 60 * 60 * 1000);
    const docs = await repo('erros_servidor')
      .find({ expiraEm: { $gte: limite } }, { projection: { rota: 1, requestId: 1, em: 1 } })
      .sort({ expiraEm: -1 })
      .limit(5000)
      .toArray();
    const porRota = new Map();
    for (const d of docs) {
      const rota = typeof d.rota === 'string' ? d.rota : 'desconhecida';
      const atual = porRota.get(rota);
      if (!atual) porRota.set(rota, { rota, n: 1, ultimoRequestId: d.requestId ?? null, ultimoEm: d.em });
      else {
        atual.n++;
        if (d.em > atual.ultimoEm) { atual.ultimoEm = d.em; atual.ultimoRequestId = d.requestId ?? null; }
      }
    }
    return [...porRota.values()].sort((a, b) => b.n - a.n).slice(0, 20).map(({ rota, n, ultimoRequestId }) => ({ rota, n, ultimoRequestId }));
  }

  // O que estiver no localizador vale (o teste de uma fatia pode ter registrado um falso antes).
  const doLocalizador = (nome, real) => servicos.tentar(nome) ?? real;
  const comum = Object.freeze({
    repo,
    acesso: doLocalizador('acesso', acesso),
    auditoria: doLocalizador('auditoria', auditoria),
    notificacoes: doLocalizador('notificacoes', notificacoes),
    arquivos: doLocalizador('arquivos', arquivos),
    email: doLocalizador('email', email),
    cifra: doLocalizador('cifra', cifra),
    assinador: doLocalizador('assinador', assinador),
    contador: doLocalizador('contador', contador),
    throttle: criarThrottle, csv, configPortal, jwtSecret, hashSenha, checkSenha, signToken, publicUser, capaUrl,
    agora, log,
    // acréscimos: perfis (os serviços perfis.*), garantia de índices (serviços que gravam com
    // índice único esperam por conta própria, API §4.4) e o registro de índices
    perfis: { publicos: doLocalizador('perfis.publicos', perfis.publicos), identificacao: doLocalizador('perfis.identificacao', perfis.identificacao) },
    garantia, registrarIndices
  });

  // ---------- Routers do agregador ----------
  const agregado = criarRotasVazias();
  agregado.publico.get('/saude', (_req, res) => {
    res.json({
      ok: estado.falhas.length === 0,
      modulos: { esperados: estado.esperados, carregados: estado.carregados, comFalha: estado.falhas.length }
    });
  });

  const lista = aplicarFiltroDeModulos(modulos, filtro);
  estado.esperados = lista.length;

  async function carregarModulos() {
    for (const entrada of lista) {
      const caminho = entrada.caminho;
      let etapa = 'importacao';
      const indicesAntes = new Set(especificacoesRegistradas().map(e => e.opcoes.name));
      try {
        let mod;
        try {
          mod = await entrada.importar();
        } catch (err) {
          if (ehModuloAusente(err, caminho)) {
            estado.ausentes.push(caminho);
            linha(estrito ? 'erro' : 'aviso', { evento: 'portal.modulo', caminho, etapa: 'ausente' });
            continue;
          }
          throw err;
        }
        etapa = 'montagem';
        const montar = mod?.default;
        if (typeof montar !== 'function') throw new TypeError(`${caminho}: falta o export default montar(ctx).`);
        const rotas = criarRotasVazias();
        const lote = criarLoteDeServicos(servicos);
        await montar({ rotas, servicos: lote, comum, caminho });
        etapa = 'servico-duplicado';
        lote.confirmar();
        for (const k of Object.keys(agregado)) agregado[k].use(rotas[k]);
        estado.carregados++;
        estado.rotas[caminho] = Object.keys(rotas).flatMap(k => listarRotas(rotas[k], `/api${PREFIXOS_ROTAS[k]}`));
        estado.indices[caminho] = especificacoesRegistradas().map(e => e.opcoes.name).filter(n => !indicesAntes.has(n));
      } catch (err) {
        const etapaFinal = err?.codigo === 'servico-duplicado' ? 'servico-duplicado' : etapa;
        const erro = resumirErro(err);
        estado.falhas.push({ caminho, etapa: etapaFinal, erro });
        linha('erro', { evento: 'portal.modulo', caminho, etapa: etapaFinal, erroResumido: erro });
        if (falharCedo) throw err;
      }
    }
    estado.concluida = true;
  }

  let carga = null;
  const obterCarga = () => (carga ||= carregarModulos());

  async function preparar(req, _res, next) {
    try {
      await obterCarga();
    } catch (err) {
      return next(err);
    }
    if (/^\/(auth|portal)(\/|$)/.test(req.path)) {
      try { await garantia.garantir(); } catch (err) { return next(err); }
      return next();
    }
    // Rota legada: não espera os índices (partida a frio da Vercel); dispara em segundo plano.
    garantia.garantir().catch(err => linha('aviso', { evento: 'portal.indices', texto: 'garantia de índices em segundo plano falhou', erroResumido: resumirErro(err) }));
    return next();
  }

  const registro = criarRegistroDeErros({ repo, agora, log });
  const tratarErroPortal = criarTratadorErroPortal({ registro, log, agora });
  const adminMws = Array.isArray(exigirAdmin) ? exigirAdmin : [exigirAdmin];

  const raiz = Router();
  raiz.use(idDaRequisicao);                                                       // 0
  raiz.use(preparar);                                                             // 1
  raiz.use(exigirTrocaDeSenha);                                                   // 2
  raiz.use('/auth', semCache, agregado.auth);                                     // 3
  raiz.use('/portal', semCache, agregado.publico);                                // 4
  raiz.use('/portal', exigirLogin);                                               // 5
  raiz.use(['/portal/admin', '/portal/professor'], exigirSegundoFatorAdmin({ configPortal })); // 6
  raiz.use('/portal/admin', ...adminMws, agregado.admin);                         // 7
  raiz.use('/portal/professor', exigirPapel('professor', 'admin'), agregado.professor); // 8
  raiz.use('/portal', agregado.aluno);                                            // 9
  raiz.use(['/auth', '/portal'], tratarErroPortal);                               // 10

  // Diagnóstico (acréscimos; usados pelos testes e pelo painel).
  raiz.carregar = obterCarga;
  raiz.estadoDoPortal = () => ({
    esperados: estado.esperados, carregados: estado.carregados, concluida: estado.concluida,
    ausentes: [...estado.ausentes], falhas: estado.falhas.map(f => ({ ...f, erro: { ...f.erro } })),
    rotas: Object.fromEntries(Object.entries(estado.rotas).map(([c, l]) => [c, [...l]])),
    indices: Object.fromEntries(Object.entries(estado.indices).map(([c, l]) => [c, [...l]]))
  });
  raiz.servicos = servicos;
  raiz.garantia = garantia;
  return raiz;
}
