// =============================================================
// COMPLEXO DMC · /api/portal — acadêmico do aluno, comprovantes e boletim
// PORTAL-API §6.7.3 (acadêmico), §6.7.4 (comprovantes), §4.4 (serviços
// academico.*), grupos validador FRQ, aoConcluirAula, cascata, exportador,
// painel e notificacaoSobDemanda · índice §8.1 (F3a) · dono: F3a.
//
// Fábrica testável (padrão bolsas.test.js): criarRotaAcademico(deps)
// devolve { aluno, professor } (Routers) e o serviço acadêmico; o
// `montar(ctx)` do agregador liga os Routers e registra serviços,
// grupos e índices (sem E/S).
// =============================================================
import { Router } from 'express';
import { erro } from '../portal/erros.js';
import { lerId, lerPagina } from '../portal/validacao.js';
import { CODIGO_VERIFICACAO_RE } from '../portal/codigos.js';
import { criarServicoAcademico, STATUS_VIGENTE } from '../portal/academico/servico-academico.js';
import { INDICES_ACADEMICO, hex, oidDe, formas } from '../portal/academico/repositorios.js';
import { criteriosDe, statusDoEncontro, encontroVisivel } from '../portal/academico/calculo-academico.js';

export const LIMITE_RELATORIO = 300;
export const POR_PAGINA_COMPROVANTES = 100;
const DATA_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIPOS_COMPROVANTE = Object.freeze({ todos: 'todos', avaliacao: 'avaliacao', avaliacoes: 'avaliacao', frequencia: 'frequencia' });

const iso = d => (d instanceof Date ? d.toISOString() : (d ? new Date(d).toISOString() : null));
const assincrono = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** 'AAAA-MM-DD' no fuso de SP → Date (início ou fim do dia). Inválida → ErroPortal 400. */
export function dataSP(valor, campo, { fimDoDia = false } = {}) {
  if (valor === undefined || valor === null || valor === '') return null;
  if (typeof valor !== 'string' || !DATA_RE.test(valor)) throw erro(400, 'validacao', undefined, { campos: { [campo]: 'Use o formato AAAA-MM-DD.' } });
  const d = new Date(`${valor}T${fimDoDia ? '23:59:59.999' : '00:00:00.000'}-03:00`);
  if (!Number.isFinite(d.getTime())) throw erro(400, 'validacao', undefined, { campos: { [campo]: 'Data inválida.' } });
  return d;
}

function itemFrequencia(f) {
  const s = f.snapshot || {};
  return {
    tipo: 'frequencia',
    codigo: f.codigo,
    registradaEm: iso(f.registradaEm),
    origem: f.origem,
    via: f.via,
    curso: s.cursoTitulo || null,
    modulo: s.moduloTitulo || null,
    encontro: f.origem === 'ao_vivo' ? { titulo: s.encontroTitulo || null, inicioEm: iso(s.encontroInicioEm) } : null,
    aula: f.origem === 'gravado' ? { titulo: s.aulaTitulo || null, codigo: s.aulaCodigo || null } : null,
    turmaCodigo: s.turmaCodigo || null,
    pctVideo: typeof f.pctVideo === 'number' ? f.pctVideo : null,
    anulada: !!f.anulada,
    anuladaEm: f.anulada ? iso(f.anulada.em) : null,
    hash: f.hash || null
  };
}

function itemAvaliacao(t) {
  const corrigida = t.status === 'corrigida';
  return {
    tipo: 'avaliacao',
    codigo: corrigida ? t.codigo || null : null,
    avaliacao: t.avaliacao || null,
    avaliacaoTipo: t.avaliacaoTipo || null,
    modulo: t.modulo || null,
    numero: t.numero ?? null,
    iniciadaEm: iso(t.iniciadaEm),
    enviadaEm: iso(t.enviadaEm),
    pctAcerto: corrigida && typeof t.pctAcerto === 'number' ? t.pctAcerto : null,
    nota: corrigida && typeof t.nota === 'number' ? t.nota : null,
    status: t.status || null,
    hash: corrigida ? t.hash || null : null
  };
}

/**
 * @param {{ repo, servicos, assinador?, auditoria?, notificacoes?, garantia?, perfis?, acesso?, agora?, log? }} deps
 */
export function criarRotaAcademico(deps = {}) {
  const { repo, servicos } = deps;
  if (typeof repo !== 'function') throw new TypeError('criarRotaAcademico: informe repo.');
  if (!servicos) throw new TypeError('criarRotaAcademico: informe servicos.');
  const agora = deps.agora || (() => new Date());
  const log = deps.log || console;
  const svc = criarServicoAcademico({ ...deps, agora, log });
  const acesso = () => deps.acesso || servicos.obter('acesso');

  // ---------------- comprovantes (aluno e professor) ----------------
  async function comprovantes({ userId, matriculaIds = null, query }) {
    const tipo = TIPOS_COMPROVANTE[String(query.tipo || 'todos')] || null;
    if (!tipo) throw erro(400, 'validacao', undefined, { campos: { tipo: 'Use avaliacao, frequencia ou todos.' } });
    const cursoId = typeof query.cursoId === 'string' && query.cursoId ? query.cursoId : (typeof query.curso === 'string' && query.curso ? query.curso : null);
    const de = dataSP(query.de, 'de');
    const ate = dataSP(query.ate, 'ate', { fimDoDia: true });
    const { pagina } = lerPagina(query, { porPaginaPadrao: POR_PAGINA_COMPROVANTES, max: POR_PAGINA_COMPROVANTES });

    const itens = [];
    if (tipo !== 'avaliacao') {
      let freqs = await svc.R.frequenciasDoUsuario(userId);
      if (matriculaIds) { const ok = new Set(matriculaIds.map(String)); freqs = freqs.filter(f => ok.has(hex(f.matriculaId))); }
      for (const f of freqs) {
        if (cursoId && String(f.cursoId) !== cursoId) continue;
        itens.push({ em: new Date(f.registradaEm), item: itemFrequencia(f) });
      }
    }
    if (tipo !== 'frequencia') {
      const f = servicos.tentar('avaliacoes.tentativasDoAluno');
      if (typeof f === 'function') {
        const lista = matriculaIds
          ? (await Promise.all(matriculaIds.map(id => f(String(userId), { matriculaId: String(id) })))).flat()
          : await f(String(userId), cursoId ? { cursoId } : {});
        for (const t of lista || []) {
          if (cursoId && t.cursoId && String(t.cursoId) !== cursoId) continue;
          const em = t.enviadaEm || t.iniciadaEm;
          if (!em) continue;
          itens.push({ em: new Date(em), item: itemAvaliacao(t) });
        }
      }
    }
    const filtrados = itens
      .filter(x => Number.isFinite(x.em.getTime()) && (!de || x.em >= de) && (!ate || x.em <= ate))
      .sort((a, b) => b.em - a.em);
    const total = filtrados.length;
    const porPagina = POR_PAGINA_COMPROVANTES;
    return {
      itens: filtrados.slice((pagina - 1) * porPagina, pagina * porPagina).map(x => x.item),
      pagina, porPagina, total, totalPaginas: Math.max(1, Math.ceil(total / porPagina)),
      emitidoEm: agora().toISOString(),
      avaliacoesDisponiveis: typeof servicos.tentar('avaliacoes.tentativasDoAluno') === 'function',
      urlValidacao: 'validar.html?codigo='
    };
  }

  // ---------------- Routers ----------------
  const aluno = Router();
  const professor = Router();

  aluno.get('/me/academico', assincrono(async (req, res) => {
    const r = await svc.academicoDoAluno(String(req.user._id));
    res.json(r);
  }));

  aluno.get('/me/academico/:matriculaId', assincrono(async (req, res) => {
    if (!lerId(req.params.matriculaId)) throw erro(404, 'nao-encontrado');
    const m = await svc.matriculaPorId(req.params.matriculaId);
    if (!m || String(m.userId) !== String(req.user._id)) throw erro(404, 'nao-encontrado');
    res.json(await svc.resumoDaMatricula(m, { visao: 'aluno', reconciliar: true }));
  }));

  aluno.get('/me/comprovantes', assincrono(async (req, res) => {
    const userId = String(req.user._id);
    const corpo = await comprovantes({ userId, query: req.query || {} });
    const mats = await svc.matriculasDoAluno(userId);
    const nome = await svc.nomeDoTitular(userId);
    res.json({ ...corpo, titular: { nome: nome || req.user.nome || null, matriculas: mats.filter(m => m.numero).map(m => m.numero) } });
  }));

  async function matriculaDaEquipe(req) {
    if (!lerId(req.params.matriculaId)) throw erro(404, 'nao-encontrado');
    const m = await svc.matriculaPorId(req.params.matriculaId);
    if (!m || !(await acesso().podeVerMatricula(req, m))) throw erro(404, 'nao-encontrado');
    return m;
  }

  async function alunoPublico(userId) {
    const f = servicos.tentar('perfis.publicos');
    if (typeof f === 'function') {
      const mapa = await f([String(userId)]);
      const p = mapa?.get ? mapa.get(String(userId)) : null;
      if (p) return { nome: p.nome || null, nomeSocial: p.nomeSocial || null, fotoUrl: p.fotoUrl || null, email: p.email || null };
    }
    const u = await svc.R.usuario(userId);
    return { nome: u?.nome || null, nomeSocial: null, fotoUrl: null, email: u?.email || null };
  }

  professor.get('/matriculas/:matriculaId/academico', assincrono(async (req, res) => {
    const m = await matriculaDaEquipe(req);
    const resumo = await svc.resumoDaMatricula(m, { visao: 'professor' });
    res.json({ ...resumo, aluno: await alunoPublico(m.userId) });
  }));

  professor.get('/matriculas/:matriculaId/comprovantes', assincrono(async (req, res) => {
    const m = await matriculaDaEquipe(req);
    res.json(await comprovantes({ userId: String(m.userId), matriculaIds: [hex(m._id)], query: req.query || {} }));
  }));

  professor.get('/cursos/:cursoId/boletim', assincrono(async (req, res) => {
    const cursoId = String(req.params.cursoId || '');
    const curso = await svc.R.curso(cursoId);
    if (!curso) throw erro(404, 'nao-encontrado');
    const a = acesso();
    if (!(await a.podeGerirTurma(req, cursoId, null)) && !(await a.contexto(req)).cursosDocente.has(cursoId)) throw erro(403, 'nao-docente');
    const visiveis = await a.turmasVisiveis(req, cursoId);
    const turmaId = typeof req.query.turmaId === 'string' && req.query.turmaId ? req.query.turmaId : null;
    let turmaIds = visiveis;
    if (turmaId) {
      if (visiveis && !visiveis.includes(turmaId)) throw erro(403, 'nao-docente');
      turmaIds = [turmaId];
    }
    const mats = (await svc.alunosDoCurso({ cursoId, turmaIds })).filter(m => m.status !== 'cancelada');
    if (mats.length > LIMITE_RELATORIO) throw erro(413, 'relatorio-grande');
    const usuarios = await svc.R.usuarios(mats.map(m => m.userId));
    const modulos = await svc.R.modulosDoCurso(cursoId);
    const alunos = [];
    let temModular = {};
    for (const m of mats) {
      const doc = (await svc.matriculaPorId(m._id)) || m;
      const calc = await svc.calcularMatricula(doc);
      for (const l of calc.linhas) if (l.temModular) temModular[l.moduloId] = true;
      alunos.push({
        matriculaId: hex(m._id), nome: usuarios.get(String(m.userId))?.nome || null, nomeSocial: null,
        celulas: calc.linhas.map(l => ({ moduloId: l.moduloId, nota: l.media, situacao: l.situacao, frequenciaPct: l.frequencia?.pct ?? null }))
      });
    }
    res.json({
      modulos: modulos.map((m, i) => ({ id: String(m._id), numero: m.numero || String(i + 1).padStart(2, '0'), titulo: m.titulo || '', temModular: !!temModular[String(m._id)] })),
      alunos
    });
  }));

  return { aluno, professor, svc, comprovantes };
}

/** Grupos e serviços da F3a (registrados pelo montar; exportado para os testes). */
export function registrarServicosAcademico(servicos, svc, { repo }) {
  servicos.registrar('academico.criteriosDe', curso => criteriosDe(curso));
  servicos.registrar('academico.situacaoDoCurso', (userId, cursoId) => svc.situacaoDoCurso(userId, cursoId));
  servicos.registrar('academico.resumoMatricula', (matriculaId, opcoes) => svc.resumoMatricula(matriculaId, opcoes));
  servicos.registrar('academico.proximosEncontros', (userId, opcoes) => svc.proximosEncontros(userId, opcoes));
  servicos.registrar('academico.encontrosDoEscopo', (cursoIds, opcoes) => svc.encontrosDoEscopo(cursoIds, opcoes));

  servicos.adicionar('validador', {
    prefixo: 'FRQ',
    validar: async codigo => (CODIGO_VERIFICACAO_RE.test(String(codigo)) ? svc.validarFrequencia(String(codigo)) : null),
    nomeTitular: async (codigo) => {
      const f = await svc.R.frequenciaPorCodigo(String(codigo));
      return f ? svc.nomeDoTitular(f.userId) : null;
    }
  });

  servicos.adicionar('aoConcluirAula', ctx => svc.aoConcluirAula(ctx));

  const freqs = () => repo('frequencias');
  servicos.adicionar('cascata', {
    dominio: 'frequencias',
    async bloqueios(alvo = {}) {
      const id = String(alvo.id ?? '');
      if (!id) return 0;
      if (alvo.tipo === 'curso') return freqs().countDocuments({ cursoId: id });
      if (alvo.tipo === 'modulo') return freqs().countDocuments({ moduloId: id });
      if (alvo.tipo === 'encontro') return freqs().countDocuments({ encontroId: id });
      if (alvo.tipo === 'aula') {
        const direta = await freqs().countDocuments({ aulaId: id });
        const encs = await repo('lives').find({ aulaGravadaId: id }, { projection: { _id: 1 } }).toArray();
        const pres = encs.length ? await freqs().countDocuments({ encontroId: { $in: encs.map(e => String(e._id)) } }) : 0;
        return direta + pres;
      }
      return 0;
    },
    async apagar(alvo = {}) {
      // Frequência nunca é apagada (append-only); só desfaz vínculos de encontros com o que sai.
      const id = String(alvo.id ?? '');
      if (!id) return;
      if (alvo.tipo === 'aula') await repo('lives').updateMany({ aulaGravadaId: id }, { $set: { aulaGravadaId: null } });
      if (alvo.tipo === 'modulo') await repo('lives').updateMany({ moduloId: id }, { $set: { moduloId: null, aulaGravadaId: null } });
    }
  });

  servicos.adicionar('exportador', {
    dominio: 'frequencias',
    async exportar(userId) {
      const lista = await freqs().find({ userId: String(userId) }).toArray();
      return lista.map(f => ({ codigo: f.codigo, origem: f.origem, via: f.via, registradaEm: iso(f.registradaEm), curso: f.snapshot?.cursoTitulo || null, modulo: f.snapshot?.moduloTitulo || null, anulada: !!f.anulada }));
    }
  });

  servicos.adicionar('painel', {
    bloco: 'academico',
    chaves: ['encontrosProximos7d'],
    papeis: ['professor', 'admin'],
    async contar(_req, escopo = {}) {
      const filtro = { cancelado: { $ne: true } };
      if (Array.isArray(escopo.cursoIds)) filtro.cursoId = { $in: escopo.cursoIds.map(String) };
      const agora = new Date();
      filtro.inicioEm = { $gte: agora, $lt: new Date(agora.getTime() + 7 * 86400000) };
      return { encontrosProximos7d: await repo('lives').countDocuments(filtro) };
    }
  });

  // Relatórios `frequencia` e `presencas` (API §6.11.3): mesma conta do Acadêmico (§8.7),
  // com a regra de docência de §4.2 (turmas visíveis) e o teto de linhas do chamador.
  async function escopoDoRelatorio(req, filtros) {
    const cursoId = typeof filtros.cursoId === 'string' ? filtros.cursoId : '';
    if (!cursoId) throw erro(400, 'validacao', undefined, { campos: { cursoId: 'Escolha o curso.' } });
    const acesso = servicos.obter('acesso');
    const visiveis = await acesso.turmasVisiveis(req, cursoId);
    if (Array.isArray(visiveis) && !visiveis.length) throw erro(403, 'nao-docente');
    const turmaId = typeof filtros.turmaId === 'string' && filtros.turmaId ? filtros.turmaId : null;
    if (turmaId && Array.isArray(visiveis) && !visiveis.includes(turmaId)) throw erro(403, 'nao-docente');
    const turmaIds = turmaId ? [turmaId] : visiveis;
    const mats = (await svc.alunosDoCurso({ cursoId, turmaIds })).filter(m => m.status !== 'cancelada' && (!turmaIds || turmaIds.includes(hex(m.turmaId))));
    return { cursoId, mats };
  }
  const teto = (n, limite) => { if (Number.isFinite(limite) && n > limite) throw erro(413, 'relatorio-grande'); };

  async function calcularDoRelatorio(req, filtros) {
    const { cursoId, mats } = await escopoDoRelatorio(req, filtros);
    const [curso, modulos, usuarios, turmas] = await Promise.all([
      svc.R.curso(cursoId), svc.R.modulosDoCurso(cursoId), svc.R.usuarios(mats.map(m => m.userId)), svc.R.turmas(mats.map(m => m.turmaId).filter(Boolean))
    ]);
    const calc = [];
    for (const m of mats) {
      const doc = (await svc.matriculaPorId(m._id)) || m;
      calc.push({ m: doc, c: await svc.calcularMatricula(doc) });
    }
    return { curso, modulos, usuarios, turmas, calc };
  }

  servicos.adicionar('relatorio', {
    id: 'frequencia', titulo: 'Frequência', papeis: ['professor', 'admin'],
    filtros: [{ chave: 'cursoId', tipo: 'curso', obrigatorio: true }, { chave: 'turmaId', tipo: 'turma' }],
    colunas: [
      { chave: 'curso', rotulo: 'Curso', tipo: 'texto' }, { chave: 'turma', rotulo: 'Turma', tipo: 'texto' },
      { chave: 'matricula', rotulo: 'Nº da matrícula', tipo: 'texto' }, { chave: 'nome', rotulo: 'Nome', tipo: 'texto' },
      { chave: 'modulo', rotulo: 'Módulo', tipo: 'texto' }, { chave: 'contaveis', rotulo: 'Contáveis', tipo: 'numero' },
      { chave: 'presencasAoVivo', rotulo: 'Presenças ao vivo', tipo: 'numero' }, { chave: 'compensadas', rotulo: 'Compensadas', tipo: 'numero' },
      { chave: 'gravadas', rotulo: 'Gravadas', tipo: 'numero' }, { chave: 'faltas', rotulo: 'Faltas', tipo: 'numero' },
      { chave: 'frequenciaPct', rotulo: 'Frequência %', tipo: 'pct' }, { chave: 'aoVivoPct', rotulo: 'Ao vivo %', tipo: 'pct' },
      { chave: 'gravadoPct', rotulo: 'Gravado %', tipo: 'pct' }
    ],
    async consultar(req, filtros = {}, { limite = 20000 } = {}) {
      const { curso, modulos, usuarios, turmas, calc } = await calcularDoRelatorio(req, filtros);
      const linhas = [];
      for (const { m, c } of calc) {
        const base = { curso: curso?.titulo || '', turma: m.turmaId ? turmas.get(hex(m.turmaId))?.codigo || null : null, matricula: m.numero || null, nome: usuarios.get(String(m.userId))?.nome || null };
        const bloco = (rotulo, f) => ({ ...base, modulo: rotulo, contaveis: f?.contaveis ?? 0, presencasAoVivo: f?.presente ?? 0, compensadas: f?.compensado ?? 0, gravadas: f?.gravado ?? 0, faltas: f?.faltas ?? 0, frequenciaPct: f?.frequenciaPct ?? null, aoVivoPct: f?.aoVivoPct ?? null, gravadoPct: f?.gravadoPct ?? null });
        linhas.push(bloco('Geral', c.freq));
        for (const mod of modulos) linhas.push(bloco(`${mod.numero || ''} ${mod.titulo || ''}`.trim(), c.freq.porModulo[String(mod._id)]));
        teto(linhas.length, limite);
      }
      return linhas;
    },
    async resumir(req, filtros = {}) {
      const { curso, calc } = await calcularDoRelatorio(req, filtros);
      const media = chave => { const v = calc.map(x => x.c.freq[chave]).filter(n => typeof n === 'number'); return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null; };
      const minimo = criteriosDe(curso).frequenciaMinima;
      const porEncontro = new Map();
      for (const { c } of calc) {
        for (const e of c.freq.porEncontro) {
          if (e.estado === 'futuro') continue;
          const p = porEncontro.get(e.encontroId) || { esperados: 0, ok: 0 };
          p.esperados++;
          if (e.estado === 'presente' || e.estado === 'compensado') p.ok++;
          porEncontro.set(e.encontroId, p);
        }
      }
      const encontros = porEncontro.size ? await repo('lives').find({ _id: { $in: [...porEncontro.keys()] } }, { projection: { inicioEm: 1 } }).sort({ inicioEm: 1 }).toArray() : [];
      const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'short', day: '2-digit', month: '2-digit' });
      return {
        kpis: [
          { chave: 'frequenciaMediaPct', rotulo: 'Frequência média', valor: media('frequenciaPct'), formato: 'pct' },
          { chave: 'aoVivoMediaPct', rotulo: 'Ao vivo (média)', valor: media('aoVivoPct'), formato: 'pct' },
          { chave: 'gravadoMediaPct', rotulo: 'Gravado (média)', valor: media('gravadoPct'), formato: 'pct' },
          { chave: 'abaixoDoMinimo', rotulo: 'Abaixo do mínimo', valor: minimo === null ? null : calc.filter(x => typeof x.c.freq.frequenciaPct === 'number' && x.c.freq.frequenciaPct < minimo).length, formato: 'numero', ...(minimo === null ? { nota: 'Curso sem frequência mínima definida.' } : {}) }
        ],
        series: [{
          chave: 'frequenciaPorEncontro', rotulo: 'Presentes e compensados entre os esperados', formato: 'pct',
          pontos: encontros.map((e) => { const p = porEncontro.get(String(e._id)); return { rotulo: fmt.format(new Date(e.inicioEm)).replace('.', ''), valor: p.esperados ? Math.round((1000 * p.ok) / p.esperados) / 10 : null }; })
        }]
      };
    }
  });

  servicos.adicionar('relatorio', {
    id: 'presencas', titulo: 'Presenças por encontro', papeis: ['professor', 'admin'],
    filtros: [{ chave: 'cursoId', tipo: 'curso', obrigatorio: true }, { chave: 'turmaId', tipo: 'turma' }, { chave: 'de', tipo: 'data' }, { chave: 'ate', tipo: 'data' }],
    colunas: [
      { chave: 'encontro', rotulo: 'Encontro', tipo: 'texto' }, { chave: 'inicio', rotulo: 'Início', tipo: 'dataHora' },
      { chave: 'turma', rotulo: 'Turma', tipo: 'texto' }, { chave: 'modulo', rotulo: 'Módulo', tipo: 'texto' },
      { chave: 'matricula', rotulo: 'Nº da matrícula', tipo: 'texto' }, { chave: 'nome', rotulo: 'Nome', tipo: 'texto' },
      { chave: 'presenca', rotulo: 'Presença', tipo: 'texto' }, { chave: 'via', rotulo: 'Via', tipo: 'texto' },
      { chave: 'registradaEm', rotulo: 'Registrada em', tipo: 'dataHora' }
    ],
    async consultar(req, filtros = {}, { limite = 20000 } = {}) {
      const { cursoId, mats } = await escopoDoRelatorio(req, filtros);
      const de = filtros.de ? dataSP(filtros.de, 'de') : null;
      const ate = filtros.ate ? dataSP(filtros.ate, 'ate', { fimDoDia: true }) : null;
      const [encontros, usuarios, turmas, modulos] = await Promise.all([
        svc.R.encontrosDoCurso(cursoId, { de, ate }), svc.R.usuarios(mats.map(m => m.userId)),
        svc.R.turmas([...mats.map(m => m.turmaId).filter(Boolean)]), svc.R.modulosDoCurso(cursoId)
      ]);
      const freqs = await svc.R.frequenciasDasMatriculas(mats.map(m => m._id));
      const mods = new Map(modulos.map(m => [String(m._id), m]));
      const VIA = { entrada: 'Entrada pelo portal', lancamento_professor: 'Lançada pelo professor' };
      const linhas = [];
      for (const e of encontros.filter(x => !x.cancelado)) {
        const esperados = mats.filter(m => encontroVisivel(e, m));
        const tCodigo = e.turmaId ? (turmas.get(hex(e.turmaId))?.codigo || (await svc.R.turma(e.turmaId))?.codigo || null) : null;
        for (const m of esperados) {
          const f = freqs.find(x => hex(x.matriculaId) === hex(m._id) && x.origem === 'ao_vivo' && String(x.encontroId) === String(e._id));
          linhas.push({
            encontro: e.titulo || '', inicio: iso(e.inicioEm), turma: tCodigo, modulo: e.moduloId ? (mods.get(String(e.moduloId))?.titulo || null) : null,
            matricula: m.numero || null, nome: usuarios.get(String(m.userId))?.nome || null,
            presenca: f ? (f.anulada ? 'anulada' : 'sim') : 'não', via: f ? (VIA[f.via] || f.via) : null, registradaEm: f ? iso(f.registradaEm) : null
          });
          teto(linhas.length, limite);
        }
      }
      return linhas;
    }
  });

  servicos.adicionar('notificacaoSobDemanda', {
    tipo: 'encontro.proximo',
    async gerar(userId, { agora = new Date(), emitir } = {}) {
      if (typeof emitir !== 'function') return;
      const lista = await svc.proximosEncontros(userId, { dias: 1, limite: 10 });
      for (const e of lista) {
        const inicio = new Date(e.inicioEm);
        if (inicio < agora || inicio.getTime() - agora.getTime() > 86400000) continue;
        await emitir({
          userIds: [String(userId)], tipo: 'encontro.proximo', titulo: 'Encontro ao vivo nas próximas 24 horas',
          texto: `${e.titulo}${e.cursoTitulo ? ` · ${e.cursoTitulo}` : ''}`, link: 'ao-vivo.html', entidade: { tipo: 'encontro', id: e.id },
          chave: `encontro:${e.id}:proximo`
        });
      }
    }
  });
}

/** Contrato do agregador (API §5.1): SÍNCRONO no efeito e sem E/S. */
export default function montar(ctx) {
  const { rotas, servicos, comum } = ctx;
  comum.registrarIndices(INDICES_ACADEMICO);
  const r = criarRotaAcademico({
    repo: comum.repo, servicos, acesso: comum.acesso, assinador: comum.assinador, auditoria: comum.auditoria,
    notificacoes: comum.notificacoes, garantia: comum.garantia, agora: comum.agora, log: comum.log
  });
  rotas.aluno.use(r.aluno);
  rotas.professor.use(r.professor);
  registrarServicosAcademico(servicos, r.svc, { repo: comum.repo });
}

export { statusDoEncontro, STATUS_VIGENTE, oidDe, formas };
