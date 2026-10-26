// =============================================================
// COMPLEXO DMC · Portal — Perfil do titular (cadastro completo) e a visão
// da coordenação sobre o cadastro
// PORTAL-API §6.3.1, §6.3.2, §3.3 (perfis) · índice D-55 · dono: F0t.
//
// - Base legal declarada por campo (basesLegais) e visibilidade mínima.
// - Gênero/etnia (≠ "prefiro não informar"), nome social e redes só gravam
//   com consentimento vigente OU aceito no MESMO PUT (senão 428
//   `consentimento-necessario` + `finalidade`); foto exige `perfil_foto`
//   registrado antes (POST /portal/me/dados/consentimentos).
// - Travas: CPF preenchido só muda pela secretaria; nome de registro,
//   nascimento e passaporte travam depois de contrato assinado (serviço
//   secretaria.temContratoAssinado, F4b) ou certificado emitido. Sem o
//   serviço, a trava não é conferida e o PUT desses campos responde 503
//   (nunca destrava sem conferir).
// - Toda alteração passa por auditoria `executar` (mudanças mascaradas);
//   falha ao auditar → 503 e NADA muda. Concorrência por `versao`.
// - users.nome = nomeSocial || nomeRegistro (nome de exibição).
// - Endereço no Brasil (CEP + UF) ou no exterior (código postal + região).
// - Diversidade (gênero/etnia, LGPD art. 11 — achado G2, §9.8): a trilha
//   registra só 'diversidade' (nem valor nem qual dos dois mudou) e o
//   relatório sai de um RETRATO mensal, refeito só com 5+ pessoas cuja
//   mudança afeta a contagem (`perfis.diversidadeAlteradaEm`), para que
//   duas leituras + o horário do evento não revelem o dado de ninguém.
// =============================================================
import { ObjectId } from 'mongodb';
import { ErroPortal, MENSAGENS } from '../../portal/erros.js';
import {
  lerTexto, lerEnum, lerInteiro, validarCpf, validarPassaporte, validarDataCalendario, hojeSP, validarCep, validarInstagram,
  validarFacebook, validarCelular, ehBrasil, validarCodigoPostal, validarEmail, UFS, truncarIp, ID_RE
} from '../../portal/validacao.js';
import { registrarIndices } from '../../portal/indices.js';
import { lerCorpoBinario, removerMetadadosImagem } from '../../portal/arquivos.js';
import { calcularMudancas } from '../../portal/auditoria.js';
import { calcularCompletude } from '../../portal/perfis-leitura.js';
import { chaveUsuario, conferirSenhaAtual } from '../../portal/limitador.js';
import { MODELOS, montarLinkDeAcesso } from '../../portal/email.js';
import { criptoPadrao } from '../../portal/cripto.js';
import { FINALIDADE_DA_CHAVE, textoConsentimento, textosParaTela, VERSAO_TEXTO_ATUAL, CAMPOS_DIVERSIDADE } from '../../portal/consentimentos-textos.js';
import { criarConsentimentos } from './meus-dados.js';
import { emitirToken, erroCampo } from './auth-extra.js';
import { generalizarDiversidade } from './auditoria.js';

export const INDICES_PERFIS = Object.freeze([
  { colecao: 'perfis', chave: { userId: 1 }, opcoes: { name: 'uq_perfis_user', unique: true } },
  { colecao: 'perfis', chave: { cpf: 1 }, opcoes: { name: 'uq_perfis_cpf', unique: true, partialFilterExpression: { cpf: { $type: 'string' } } } },
  { colecao: 'perfis', chave: { nomeRegistro: 1 }, opcoes: { name: 'ix_perfis_nome' } }
]);
registrarIndices(INDICES_PERFIS);

export const GENEROS = Object.freeze(['feminino', 'masculino', 'nao_binario', 'outro', 'prefiro_nao_informar']);
export const ETNIAS = Object.freeze(['branca', 'preta', 'parda', 'amarela', 'indigena', 'prefiro_nao_informar']);
export const ESTADOS_CIVIS = Object.freeze(['solteiro', 'casado', 'uniao_estavel', 'separado', 'divorciado', 'viuvo', 'prefiro_nao_informar']);
export const CAMPOS_TRAVAVEIS = Object.freeze(['nomeRegistro', 'cpf', 'nascimento', 'passaporte']);
/** Campos que a coordenação NÃO edita (dependem de consentimento do titular). */
const CAMPOS_SO_DO_TITULAR = Object.freeze(['genero', 'etnia', 'nomeSocial', 'redes']);
/** Campos comparados para a auditoria (mudanças mascaradas em auditoria.js). */
const CAMPOS_AUDITADOS = Object.freeze([
  'nomeRegistro', 'nomeSocial', 'cpf', 'passaporte', 'nascimento', 'rg', 'genero', 'etnia', 'estadoCivil', 'nacionalidade',
  'naturalidade', 'celular', 'redes.instagram', 'redes.facebook', 'endereco'
]);
export const LIMITES_CPF = Object.freeze({
  conta: Object.freeze({ janelaMs: 24 * 60 * 60 * 1000, max: 3 }),
  rede: Object.freeze({ janelaMs: 24 * 60 * 60 * 1000, max: 10 })
});

const C = 'Execução de contrato (LGPD, art. 7º, V)';
const CL = 'Execução de contrato e cumprimento de obrigação legal (LGPD, art. 7º, V e II)';
const K = 'Consentimento (LGPD, art. 7º, I)';
const KS = 'Consentimento específico e destacado para dado sensível (LGPD, art. 11, I)';
const T = 'Você';
const P = 'Professores das suas turmas';
const A = 'Coordenação';
/** Base legal, finalidade e visibilidade por campo (§6.3.1). */
export const BASES_LEGAIS = Object.freeze({
  nomeRegistro: { base: C, finalidade: 'Identificação em matrícula, contratos e documentos', obrigatorio: true, visivelPara: [T, A] },
  nomeSocial: { base: K, finalidade: 'Nome de exibição escolhido por você', obrigatorio: false, visivelPara: [T, P, A] },
  cpf: { base: CL, finalidade: 'Identificação civil e fiscal', obrigatorio: true, visivelPara: [T, A] },
  passaporte: { base: C, finalidade: 'Identificação de estrangeiros sem CPF', obrigatorio: false, visivelPara: [T, A] },
  nascimento: { base: C, finalidade: 'Identificação e conferência de idade', obrigatorio: true, visivelPara: [T, A] },
  rg: { base: C, finalidade: 'Documento de identidade em contratos e declarações', obrigatorio: false, visivelPara: [T, A] },
  genero: { base: KS, finalidade: 'Estatísticas agregadas de diversidade', obrigatorio: false, visivelPara: [T] },
  etnia: { base: KS, finalidade: 'Estatísticas agregadas de diversidade', obrigatorio: false, visivelPara: [T] },
  estadoCivil: { base: C, finalidade: 'Qualificação em contratos', obrigatorio: false, visivelPara: [T, A] },
  nacionalidade: { base: C, finalidade: 'Identificação', obrigatorio: true, visivelPara: [T, A] },
  naturalidade: { base: C, finalidade: 'Identificação', obrigatorio: false, visivelPara: [T, A] },
  celular: { base: C, finalidade: 'Contato sobre os seus cursos', obrigatorio: true, visivelPara: [T, A] },
  email: { base: C, finalidade: 'Acesso e comunicação', obrigatorio: true, visivelPara: [T, P, A] },
  redes: { base: K, finalidade: 'Contato da coordenação', obrigatorio: false, visivelPara: [T, A] },
  endereco: { base: CL, finalidade: 'Contratos, documentos fiscais e correspondência', obrigatorio: true, visivelPara: [T, A] },
  foto: { base: K, finalidade: 'Identificação visual no portal', obrigatorio: false, visivelPara: [T, P, A] }
});

const iso = d => (d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null);
const tem = (o, k) => !!o && typeof o === 'object' && Object.hasOwn(o, k);
const preenchido = v => v !== undefined && v !== null && !(typeof v === 'string' && !v.trim()) && !(typeof v === 'object' && !Object.keys(v).length);
const igual = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export function perfilVazio(userId) {
  return {
    userId: String(userId), nomeRegistro: null, nomeSocial: null, cpf: null, passaporte: null, nascimento: null, rg: null,
    genero: null, etnia: null, estadoCivil: null, nacionalidade: null, naturalidade: null, celular: null,
    redes: { instagram: null, facebook: null }, endereco: null, fotoArquivoId: null,
    consentimentos: { genero: null, etnia: null, nomeSocial: null, redes: null, foto: null }, menorDeIdade: false, versao: 0
  };
}

/** Idade em anos completos na data de hoje (SP). */
export function idadeEm(nascimento, hoje) {
  if (typeof nascimento !== 'string' || typeof hoje !== 'string') return null;
  const [an, mn, dn] = nascimento.split('-').map(Number);
  const [ah, mh, dh] = hoje.split('-').map(Number);
  let idade = ah - an;
  if (mh < mn || (mh === mn && dh < dn)) idade--;
  return idade;
}

function deslocarAnos(dataIso, anos) {
  const [a, m, d] = dataIso.split('-').map(Number);
  const dia = m === 2 && d === 29 ? 28 : d;
  return `${String(a + anos).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Erros de leitor com o nome de campo prefixado ('endereco.cep'). */
function comPrefixo(prefixo, fn) {
  try { return fn(); } catch (err) {
    if (err instanceof ErroPortal && err.extras?.campos) {
      const campos = {};
      for (const [k, v] of Object.entries(err.extras.campos)) campos[`${prefixo}.${k}`] = v;
      throw new ErroPortal(err.status, err.codigo, err.message, { ...err.extras, campos });
    }
    throw err;
  }
}

function objetoOuNulo(v, campo) {
  if (v === null) return null;
  if (typeof v !== 'object' || Array.isArray(v)) throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { [campo]: 'Formato inválido.' } });
  return v;
}

function lerData(valor, campo, { min = null, max = null, mensagem = 'Informe uma data válida.' } = {}) {
  if (valor === null || valor === '') return null;
  if (typeof valor !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { [campo]: 'Formato inválido.' } });
  let s = valor.trim();
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (br) s = `${br[3]}-${br[2]}-${br[1]}`;
  const v = validarDataCalendario(s, { min, max });
  if (!v) throw erroCampo(campo, mensagem);
  return v;
}

/**
 * Lê os campos do corpo sobre o perfil atual (PUT parcial). → { novo, presentes:Set }.
 * `null` apaga opcional; desconhecidos ignorados. Lança 400 com `campos`.
 */
export function lerCamposDoPerfil(corpo, atual, { agora = () => new Date(), coordenacao = false } = {}) {
  const c = corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : null;
  if (!c) throw new ErroPortal(400, 'formato-invalido');
  const novo = { ...atual, redes: { instagram: null, facebook: null, ...(atual.redes || {}) } };
  const presentes = new Set();
  const hoje = hojeSP(agora());
  const usar = k => { presentes.add(k); return c[k]; };

  if (tem(c, 'nomeRegistro')) {
    usar('nomeRegistro');
    const v = lerTexto(c, 'nomeRegistro', { min: 2, max: 120, obrigatorio: true });
    if (!/\p{L}/u.test(v)) throw erroCampo('nomeRegistro', 'O nome precisa ter letras.');
    novo.nomeRegistro = v;
  }
  if (tem(c, 'nomeSocial') && !coordenacao) {
    usar('nomeSocial');
    novo.nomeSocial = c.nomeSocial === null ? null : lerTexto(c, 'nomeSocial', { max: 120 });
    if (novo.nomeSocial && !/\p{L}/u.test(novo.nomeSocial)) throw erroCampo('nomeSocial', 'O nome precisa ter letras.');
  }
  if (tem(c, 'cpf')) {
    usar('cpf');
    if (c.cpf === null || c.cpf === '') novo.cpf = null;
    else {
      if (typeof c.cpf !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { cpf: 'Formato inválido.' } });
      const v = validarCpf(c.cpf);
      if (!v) throw erroCampo('cpf', 'CPF inválido. Confira os números.');
      novo.cpf = v;
    }
  }
  if (tem(c, 'passaporte')) {
    usar('passaporte');
    const p = objetoOuNulo(c.passaporte, 'passaporte');
    if (!p) novo.passaporte = null;
    else {
      if (p.numero !== undefined && typeof p.numero !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { 'passaporte.numero': 'Formato inválido.' } });
      const numero = validarPassaporte(p.numero || '');
      if (!numero) throw erroCampo('passaporte.numero', 'Número de passaporte inválido (5 a 20 letras ou números).');
      const paisEmissor = comPrefixo('passaporte', () => lerTexto(p, 'paisEmissor', { min: 2, max: 60, obrigatorio: true }));
      novo.passaporte = { numero, paisEmissor };
    }
  }
  if (tem(c, 'nascimento')) {
    usar('nascimento');
    novo.nascimento = lerData(c.nascimento, 'nascimento', {
      min: deslocarAnos(hoje, -121), max: deslocarAnos(hoje, -12), mensagem: 'Informe uma data real (idade entre 12 e 120 anos).'
    });
    if (novo.nascimento) {
      const idade = idadeEm(novo.nascimento, hoje);
      if (idade === null || idade < 12 || idade > 120) throw erroCampo('nascimento', 'Informe uma data real (idade entre 12 e 120 anos).');
    }
  }
  if (tem(c, 'rg')) {
    usar('rg');
    const r = objetoOuNulo(c.rg, 'rg');
    if (!r) novo.rg = null;
    else {
      const numero = comPrefixo('rg', () => lerTexto(r, 'numero', { min: 3, max: 20, obrigatorio: true }));
      if (!/^[0-9A-Za-z.-]+$/.test(numero)) throw erroCampo('rg.numero', 'Use só números, letras, ponto e hífen.');
      const orgaoEmissor = comPrefixo('rg', () => lerTexto(r, 'orgaoEmissor', { min: 2, max: 20 }));
      const uf = r.uf === null || r.uf === undefined || r.uf === '' ? null : comPrefixo('rg', () => lerEnum(typeof r.uf === 'string' ? r.uf.toUpperCase() : r.uf, UFS, 'uf'));
      const dataExpedicao = r.dataExpedicao === undefined ? null : lerData(r.dataExpedicao, 'rg.dataExpedicao', { min: novo.nascimento || null, max: hoje, mensagem: 'A data de expedição precisa ser depois do nascimento e até hoje.' });
      novo.rg = { numero, orgaoEmissor, dataExpedicao, uf };
    }
  }
  if (tem(c, 'genero') && !coordenacao) { usar('genero'); novo.genero = lerEnum(c.genero, GENEROS, 'genero'); }
  if (tem(c, 'etnia') && !coordenacao) { usar('etnia'); novo.etnia = lerEnum(c.etnia, ETNIAS, 'etnia'); }
  if (tem(c, 'estadoCivil')) { usar('estadoCivil'); novo.estadoCivil = lerEnum(c.estadoCivil, ESTADOS_CIVIS, 'estadoCivil'); }
  if (tem(c, 'nacionalidade')) { usar('nacionalidade'); novo.nacionalidade = c.nacionalidade === null ? null : lerTexto(c, 'nacionalidade', { min: 2, max: 60 }); }
  if (tem(c, 'naturalidade')) {
    usar('naturalidade');
    const n = objetoOuNulo(c.naturalidade, 'naturalidade');
    if (!n) novo.naturalidade = null;
    else {
      const pais = comPrefixo('naturalidade', () => lerTexto(n, 'pais', { min: 2, max: 60 })) || 'Brasil';
      const cidade = comPrefixo('naturalidade', () => lerTexto(n, 'cidade', { min: 2, max: 80, obrigatorio: true }));
      let uf = null;
      if (ehBrasil(pais)) uf = comPrefixo('naturalidade', () => lerEnum(typeof n.uf === 'string' ? n.uf.toUpperCase() : n.uf, UFS, 'uf', { obrigatorio: true }));
      novo.naturalidade = { cidade, uf, pais };
    }
  }
  if (tem(c, 'celular')) {
    usar('celular');
    if (c.celular === null || c.celular === '') novo.celular = null;
    else {
      if (typeof c.celular !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { celular: 'Formato inválido.' } });
      const v = validarCelular(c.celular);
      if (!v) throw erroCampo('celular', 'Celular inválido. Use DDD + número, ou + código do país para números do exterior.');
      novo.celular = v;
    }
  }
  if (tem(c, 'redes') && !coordenacao) {
    usar('redes');
    const r = objetoOuNulo(c.redes, 'redes');
    if (!r) novo.redes = { instagram: null, facebook: null };
    else {
      for (const [k, validar, msg] of [['instagram', validarInstagram, 'Usuário do Instagram inválido.'], ['facebook', validarFacebook, 'Perfil do Facebook inválido.']]) {
        if (!tem(r, k)) continue;
        if (r[k] === null || r[k] === '') { novo.redes[k] = null; continue; }
        if (typeof r[k] !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { [`redes.${k}`]: 'Formato inválido.' } });
        const v = validar(r[k]);
        if (!v) throw erroCampo(`redes.${k}`, msg);
        novo.redes[k] = v;
      }
    }
  }
  if (tem(c, 'endereco')) {
    usar('endereco');
    const e = objetoOuNulo(c.endereco, 'endereco');
    if (!e) novo.endereco = null;
    else {
      const L = (k, o) => comPrefixo('endereco', () => lerTexto(e, k, o));
      const pais = L('pais', { min: 2, max: 60 }) || 'Brasil';
      const logradouro = L('logradouro', { min: 2, max: 120, obrigatorio: true });
      const complemento = L('complemento', { max: 60 });
      const cidade = L('cidade', { min: 2, max: 80, obrigatorio: true });
      if (ehBrasil(pais)) {
        if (e.cep !== undefined && e.cep !== null && typeof e.cep !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { 'endereco.cep': 'Formato inválido.' } });
        const cep = validarCep(e.cep || '');
        if (!cep) throw erroCampo('endereco.cep', 'CEP inválido (8 números).');
        const uf = comPrefixo('endereco', () => lerEnum(typeof e.uf === 'string' ? e.uf.toUpperCase() : e.uf, UFS, 'uf', { obrigatorio: true }));
        novo.endereco = {
          pais: 'Brasil', cep, codigoPostal: null, logradouro, numero: L('numero', { min: 1, max: 10 }), complemento,
          bairro: L('bairro', { min: 2, max: 80 }), cidade, uf, regiao: null
        };
      } else {
        if (e.codigoPostal !== undefined && e.codigoPostal !== null && typeof e.codigoPostal !== 'string') throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { 'endereco.codigoPostal': 'Formato inválido.' } });
        const codigoPostal = validarCodigoPostal(e.codigoPostal || '');
        if (!codigoPostal) throw erroCampo('endereco.codigoPostal', 'Código postal inválido (3 a 12 letras, números, espaço ou hífen).');
        novo.endereco = {
          pais, cep: null, codigoPostal, logradouro, numero: L('numero', { min: 1, max: 10 }), complemento,
          bairro: L('bairro', { min: 2, max: 80 }), cidade, uf: null, regiao: L('regiao', { min: 2, max: 60 })
        };
      }
    }
  }
  novo.menorDeIdade = novo.nascimento ? (idadeEm(novo.nascimento, hoje) ?? 99) < 18 : false;
  return { novo, presentes };
}

/** Perfil para a resposta (sem _id e sem fotoArquivoId). */
export function saidaPerfil(doc, user, { coordenacao = false } = {}) {
  const p = doc || perfilVazio(user._id);
  const out = {
    nomeRegistro: p.nomeRegistro ?? null, nomeSocial: p.nomeSocial ?? null, cpf: p.cpf ?? null, passaporte: p.passaporte ?? null,
    nascimento: p.nascimento ?? null, rg: p.rg ?? null, genero: p.genero ?? null, etnia: p.etnia ?? null,
    estadoCivil: p.estadoCivil ?? null, nacionalidade: p.nacionalidade ?? null, naturalidade: p.naturalidade ?? null,
    celular: p.celular ?? null, redes: { instagram: p.redes?.instagram ?? null, facebook: p.redes?.facebook ?? null },
    endereco: p.endereco ?? null, temFoto: !!p.fotoArquivoId, menorDeIdade: p.menorDeIdade === true,
    email: user.email, emailVerificado: !!user.emailVerificadoEm
  };
  if (coordenacao) { out.genero = 'restrito'; out.etnia = 'restrito'; }
  return out;
}

/**
 * @param {{ aluno, admin, repo, auditoria, consentimentos?, servicos, contador, arquivos, email?, configPortal, agora?,
 *   throttle, fetchImpl?, cripto?, log? }} deps
 */
export function criarRotaPerfil(deps = {}) {
  const {
    aluno, admin, repo, auditoria, servicos, contador, arquivos, email = null, configPortal = {}, agora = () => new Date(),
    throttle, cripto = null, log = console
  } = deps;
  if (!aluno || !admin) throw new TypeError('criarRotaPerfil: informe os Routers aluno e admin.');
  if (typeof repo !== 'function' || !auditoria || !servicos || !contador || !arquivos || typeof throttle !== 'function') {
    throw new TypeError('criarRotaPerfil: informe repo, auditoria, servicos, contador, arquivos e throttle.');
  }
  const consentimentos = deps.consentimentos || criarConsentimentos({ repo, auditoria, agora });
  const cr = () => cripto || criptoPadrao();
  const fotoMax = configPortal.fotoMaxBytes || 2 * 1024 * 1024;
  const limPut = throttle({ janelaMs: 10 * 60 * 1000, max: 30, chave: chaveUsuario, codigo: 'limite', mensagem: MENSAGENS.limite });
  const limFoto = throttle({ janelaMs: 60 * 60 * 1000, max: 10, chave: chaveUsuario, codigo: 'limite', mensagem: MENSAGENS.limite });
  const limEmail = throttle({ janelaMs: 60 * 60 * 1000, max: 3, chave: chaveUsuario, codigo: 'limite', mensagem: MENSAGENS.limite });
  const emailOk = () => !!(email && email.disponivel && configPortal.baseUrl);

  async function lerPerfil(userId) {
    return repo('perfis').findOne({ userId: String(userId) });
  }

  /** → { travados:S[], conferida:B } (§6.3.1). */
  async function travasDe(userId, perfil) {
    const travados = [];
    if (preenchido(perfil?.cpf)) travados.push('cpf');
    const restantes = CAMPOS_TRAVAVEIS.filter(c => c !== 'cpf' && preenchido(perfil?.[c]));
    if (!restantes.length) return { travados, conferida: true };
    const temCertificado = (await repo('certificados').countDocuments({ userId: String(userId) })) > 0;
    if (temCertificado) return { travados: [...travados, ...restantes], conferida: true };
    const f = servicos.tentar('secretaria.temContratoAssinado');
    if (typeof f !== 'function') return { travados: [...travados, ...restantes], conferida: false };
    if (await f(String(userId))) travados.push(...restantes);
    return { travados, conferida: true };
  }

  async function consentimentosDaTela(userId) {
    const u = await consentimentos.ultimosDe(userId);
    const m = d => (d ? { aceito: d.aceito === true, versaoTexto: d.versaoTexto, em: iso(d.em) } : null);
    return { genero: m(u.perfil_genero), etnia: m(u.perfil_etnia), nomeSocial: m(u.perfil_nome_social), redes: m(u.perfil_redes), foto: m(u.perfil_foto) };
  }

  async function respostaDoTitular(user) {
    const doc = await lerPerfil(user._id);
    const { travados, conferida } = await travasDe(user._id, doc);
    return {
      perfil: saidaPerfil(doc, user),
      completude: calcularCompletude(doc, { email: user.email }),
      travados,
      travaConferida: conferida,
      basesLegais: BASES_LEGAIS,
      consentimentos: await consentimentosDaTela(user._id),
      textosConsentimento: textosParaTela(),
      versao: doc?.versao ?? 0
    };
  }

  async function recarregarUsuario(user) {
    return repo('users').findOne({ _id: user._id instanceof ObjectId ? user._id : new ObjectId(String(user._id)) });
  }

  /**
   * Grava o perfil (titular ou coordenação). `exigirConsentimentos` só para o titular.
   * → documento gravado.
   */
  async function gravarPerfil(req, alvoUser, corpo, { coordenacao = false, motivo = null } = {}) {
    const userId = String(alvoUser._id);
    const versao = lerInteiro(corpo?.versao, { min: 0, max: 1e9, obrigatorio: true }, 'versao');
    const doc = await lerPerfil(userId);
    const atual = doc ? { ...perfilVazio(userId), ...doc } : perfilVazio(userId);
    if ((doc?.versao ?? 0) !== versao) throw new ErroPortal(409, 'conflito-versao');
    const { novo, presentes } = lerCamposDoPerfil(corpo, atual, { agora, coordenacao });

    // Travas (só para o titular; a coordenação ignora a trava).
    if (!coordenacao) {
      const mudouTravavel = CAMPOS_TRAVAVEIS.filter(c => presentes.has(c) && preenchido(atual[c]) && !igual(atual[c], novo[c]));
      if (mudouTravavel.length) {
        const { travados, conferida } = await travasDe(userId, atual);
        const bloqueados = mudouTravavel.filter(c => travados.includes(c));
        if (bloqueados.length) {
          if (!conferida && !bloqueados.every(c => c === 'cpf')) throw new ErroPortal(503, 'servico-indisponivel');
          throw new ErroPortal(409, 'campo-travado', undefined, { campos: Object.fromEntries(bloqueados.map(c => [c, MENSAGENS['campo-travado']])) });
        }
      }
    }

    // Consentimentos exigidos (titular).
    const aceitarAgora = [];
    if (!coordenacao) {
      const pedidos = corpo?.consentimentos;
      if (pedidos !== undefined && pedidos !== null && (typeof pedidos !== 'object' || Array.isArray(pedidos))) throw new ErroPortal(400, 'formato-invalido', undefined, { campos: { consentimentos: 'Formato inválido.' } });
      const exigidos = [];
      if (presentes.has('genero') && novo.genero && novo.genero !== 'prefiro_nao_informar' && novo.genero !== atual.genero) exigidos.push('genero');
      if (presentes.has('etnia') && novo.etnia && novo.etnia !== 'prefiro_nao_informar' && novo.etnia !== atual.etnia) exigidos.push('etnia');
      if (presentes.has('nomeSocial') && novo.nomeSocial && novo.nomeSocial !== atual.nomeSocial) exigidos.push('nomeSocial');
      if (presentes.has('redes') && (novo.redes.instagram || novo.redes.facebook) && !igual(novo.redes, atual.redes)) exigidos.push('redes');
      for (const chave of exigidos) {
        const finalidade = FINALIDADE_DA_CHAVE[chave];
        if (await consentimentos.vigente(userId, finalidade)) continue;
        const p = pedidos?.[chave];
        if (p && typeof p === 'object' && p.aceito === true) {
          const t = textoConsentimento(finalidade, typeof p.versaoTexto === 'string' ? p.versaoTexto : VERSAO_TEXTO_ATUAL);
          if (!t) throw new ErroPortal(400, 'validacao', undefined, { campos: { [`consentimentos.${chave}`]: 'Versão do texto desconhecida.' } });
          aceitarAgora.push({ finalidade, t });
          continue;
        }
        throw new ErroPortal(428, 'consentimento-necessario', undefined, { finalidade });
      }
    }

    // CPF em uso por outra conta (limite persistente; nada de CPF em claro na auditoria).
    if (presentes.has('cpf') && novo.cpf && novo.cpf !== atual.cpf) {
      const outro = await repo('perfis').findOne({ cpf: novo.cpf, userId: { $ne: userId } }, { projection: { _id: 1 } });
      if (outro) await conflitoDeCpf(req, userId, novo.cpf);
    }

    for (const { finalidade, t } of aceitarAgora) {
      await consentimentos.registrar({ userId, finalidade, versaoTexto: t.versaoTexto, textoSha256: t.textoSha256, via: 'perfil', req });
    }

    // Gênero/etnia na trilha só como 'diversidade' (achado G2).
    const mudancas = generalizarDiversidade(calcularMudancas(atual, novo, CAMPOS_AUDITADOS));
    const t = agora();
    const porId = String(req.user._id);
    const camposGravados = {};
    for (const k of presentes) camposGravados[k] = novo[k];
    camposGravados.menorDeIdade = novo.menorDeIdade;
    camposGravados.consentimentos = await consentimentos.espelhoDe(userId);
    camposGravados.atualizadoEm = t;
    camposGravados.atualizadoPor = porId;
    // Mudança que afeta a contagem do relatório → marca para a regra de renovação do retrato.
    const diversidadeMudou = CAMPOS_DIVERSIDADE.filter(c => valorContavel(atual, atual.consentimentos, c) !== valorContavel(novo, camposGravados.consentimentos, c));
    const marcasNoInsert = diversidadeMudou.length ? { diversidadeAlteradaEm: Object.fromEntries(diversidadeMudou.map(c => [c, t])) } : {};
    const marcasNoUpdate = Object.fromEntries(diversidadeMudou.map(c => [`diversidadeAlteradaEm.${c}`, t]));
    const nomeExibicao = (novo.nomeSocial && String(novo.nomeSocial).trim()) || novo.nomeRegistro || null;

    await auditoria.executar({
      acao: coordenacao ? 'perfil.alterado_pela_equipe' : 'perfil.alterado', entidade: { tipo: 'perfil', id: userId }, alvoUserId: userId,
      mudancas, motivo
    }, req, async () => {
      try {
        if (!doc) {
          await repo('perfis').insertOne({ ...perfilVazio(userId), ...camposGravados, ...marcasNoInsert, versao: 1, criadoEm: t });
        } else {
          const r = await repo('perfis').updateOne({ userId, versao }, { $set: { ...camposGravados, ...marcasNoUpdate }, $inc: { versao: 1 } });
          if (!r || r.matchedCount === 0) throw new ErroPortal(409, 'conflito-versao');
        }
      } catch (err) {
        if (err?.code === 11000) {
          const msg = String(err.message || '');
          if (/uq_perfis_cpf/.test(msg) || err.keyPattern?.cpf) throw new ErroPortal(409, 'cpf-em-uso');
          throw new ErroPortal(409, 'conflito-versao');
        }
        throw err;
      }
      if (nomeExibicao && nomeExibicao !== alvoUser.nome) {
        await repo('users').updateOne({ _id: alvoUser._id }, { $set: { nome: nomeExibicao } });
      }
    });
  }

  async function conflitoDeCpf(req, userId, cpf) {
    const rede = truncarIp(req.ip) || 'sem-rede';
    const [rc, rr] = await Promise.all([
      contador.consumir(`cpf-em-uso:${userId}`, LIMITES_CPF.conta),
      contador.consumir(`cpf-em-uso:${rede}`, LIMITES_CPF.rede)
    ]);
    let cpfHmac = null;
    try { cpfHmac = cr().hmacIdentificador(cpf); } catch { /* sem material: segue sem o HMAC */ }
    await auditoria.registrar({ acao: 'perfil.cpf_conflito', entidade: { tipo: 'perfil', id: userId }, alvoUserId: userId, extra: { cpfHmac } }, req);
    if (!rc.ok || !rr.ok) throw new ErroPortal(429, 'limite', undefined, { retryAfterSeg: Math.max(rc.retryAfterSeg || 0, rr.retryAfterSeg || 0), persistente: true });
    throw new ErroPortal(409, 'cpf-em-uso', undefined, { campos: { cpf: MENSAGENS['cpf-em-uso'] } });
  }

  // ---------- titular ----------
  aluno.get('/me/perfil', async (req, res) => {
    res.json(await respostaDoTitular(req.user));
  });

  aluno.put('/me/perfil', limPut, async (req, res) => {
    await gravarPerfil(req, req.user, req.body);
    res.json(await respostaDoTitular(await recarregarUsuario(req.user)));
  });

  // Foto: consentimento `perfil_foto` registrado ANTES (o corpo do envio é binário).
  aluno.post('/me/perfil/foto', limFoto, async (req, _res, next) => {
    // Confere o consentimento antes de ler o corpo (o 428 não depende do arquivo).
    try {
      if (!(await consentimentos.vigente(String(req.user._id), 'perfil_foto'))) return next(new ErroPortal(428, 'consentimento-necessario', undefined, { finalidade: 'perfil_foto' }));
      return next();
    } catch (err) { return next(err); }
  }, ...lerCorpoBinario({ limiteBytes: fotoMax, tipos: ['jpg', 'png', 'webp'] }), async (req, res) => {
    const userId = String(req.user._id);
    const buf = removerMetadadosImagem(req.arquivo.buf, req.arquivo.tipo);
    const anterior = await lerPerfil(userId);
    const t = agora();
    let salvo;
    await auditoria.executar({ acao: 'perfil.foto_alterada', entidade: { tipo: 'perfil', id: userId }, alvoUserId: userId, mudancas: [{ campo: 'foto', de: null, para: null }] }, req, async () => {
      salvo = await arquivos.salvar({ contexto: 'foto_perfil', donoUserId: userId, buf, tipo: req.arquivo.tipo, nomeDownload: 'foto', por: userId });
      const fotoArquivoId = new ObjectId(salvo.id);
      if (anterior) {
        await repo('perfis').updateOne({ userId }, { $set: { fotoArquivoId, atualizadoEm: t, atualizadoPor: userId } });
      } else {
        const base = perfilVazio(userId);
        try {
          await repo('perfis').insertOne({ ...base, consentimentos: await consentimentos.espelhoDe(userId), fotoArquivoId, versao: 0, criadoEm: t, atualizadoEm: t, atualizadoPor: userId });
        } catch (err) {
          if (err?.code !== 11000) throw err;
          await repo('perfis').updateOne({ userId }, { $set: { fotoArquivoId, atualizadoEm: t, atualizadoPor: userId } });
        }
      }
      await repo('users').updateOne({ _id: req.user._id }, { $set: { temFoto: true } });
      if (anterior?.fotoArquivoId) await arquivos.apagar(anterior.fotoArquivoId);
    });
    res.json({ temFoto: true, atualizadaEm: t.toISOString() });
  });

  aluno.get('/me/perfil/foto', async (req, res) => {
    const userId = String(req.user._id);
    const perfil = await repo('perfis').findOne({ userId }, { projection: { fotoArquivoId: 1 } });
    const arq = perfil?.fotoArquivoId ? await arquivos.ler(perfil.fotoArquivoId, { contexto: 'foto_perfil', donoUserId: userId }) : null;
    if (!arq) throw new ErroPortal(404, null, 'Sem foto.');
    arquivos.enviar(res, arq, { nome: 'foto', inline: true });
  });

  aluno.delete('/me/perfil/foto', async (req, res) => {
    const userId = String(req.user._id);
    const perfil = await repo('perfis').findOne({ userId }, { projection: { fotoArquivoId: 1 } });
    if (perfil?.fotoArquivoId) {
      await auditoria.executar({ acao: 'perfil.foto_removida', entidade: { tipo: 'perfil', id: userId }, alvoUserId: userId, mudancas: [{ campo: 'foto', de: null, para: null }] }, req, async () => {
        await arquivos.apagar(perfil.fotoArquivoId);
        await repo('perfis').updateOne({ userId }, { $set: { fotoArquivoId: null, atualizadoEm: agora(), atualizadoPor: userId } });
        await repo('users').updateOne({ _id: req.user._id }, { $set: { temFoto: false } });
      });
    }
    res.json({ ok: true });
  });

  // Troca de e-mail pelo titular: link de 24 h para o NOVO endereço (confirmação em /api/auth/email/confirmar).
  aluno.post('/me/perfil/email', limEmail, async (req, res) => {
    const { novoEmail, senha } = req.body || {};
    if ((novoEmail !== undefined && typeof novoEmail !== 'string') || (senha !== undefined && typeof senha !== 'string')) throw new ErroPortal(400, 'formato-invalido');
    if (!emailOk()) throw new ErroPortal(503, 'email-indisponivel', 'O envio de e-mails ainda não está configurado. Peça a troca do e-mail à secretaria pelo Atendimento.');
    const alvo = validarEmail(novoEmail || '');
    if (!alvo) throw erroCampo('novoEmail', 'Informe um e-mail válido.');
    if (!senha) throw erroCampo('senha', 'Informe a sua senha.');
    if (!(await conferirSenhaAtual(req, senha, { contador, auditoria, email, repo, agora }))) throw erroCampo('senha', 'Senha incorreta.');
    if (alvo === req.user.email) throw erroCampo('novoEmail', 'Este já é o seu e-mail.');
    const outro = await repo('users').findOne({ email: alvo }, { projection: { _id: 1 } });
    if (outro) throw new ErroPortal(409, 'email-em-uso');
    const { token } = await emitirToken(repo, { tipo: 'confirmar_email', userId: req.user._id, dados: { novoEmail: alvo }, req, agora });
    const link = montarLinkDeAcesso({ baseUrl: configPortal.baseUrl, tipo: 'email', token });
    email.enviarEmSegundoPlano({ para: alvo, ...MODELOS.confirmarNovoEmail({ nome: req.user.nome, link }) });
    res.status(202).json({ ok: true, mensagem: 'Enviamos um link de confirmação para o novo e-mail. Ele vale por 24 horas.' });
  });

  aluno.post('/me/email/verificacao', limEmail, async (req, res) => {
    if (req.user.emailVerificadoEm) throw new ErroPortal(409, 'transicao-invalida', 'O seu e-mail já está confirmado.');
    if (!emailOk()) throw new ErroPortal(503, 'email-indisponivel');
    const { token } = await emitirToken(repo, { tipo: 'verificar_email', userId: req.user._id, req, agora });
    const link = montarLinkDeAcesso({ baseUrl: configPortal.baseUrl, tipo: 'verificar', token });
    email.enviarEmSegundoPlano({ para: req.user.email, ...MODELOS.verificarEmail({ nome: req.user.nome, link }) });
    res.status(202).json({ ok: true, mensagem: 'Enviamos um link de confirmação para o seu e-mail. Ele vale por 24 horas.' });
  });

  // ---------- coordenação ----------
  async function alvoDaCoordenacao(req) {
    const id = req.params.userId;
    if (typeof id !== 'string' || !ID_RE.test(id)) throw new ErroPortal(404, null, 'Usuário não encontrado.');
    const u = await repo('users').findOne({ _id: new ObjectId(id) });
    if (!u) throw new ErroPortal(404, null, 'Usuário não encontrado.');
    return u;
  }

  admin.get('/usuarios/:userId/perfil', async (req, res) => {
    const u = await alvoDaCoordenacao(req);
    const userId = String(u._id);
    const doc = await lerPerfil(userId);
    await auditoria.registrar({ acao: 'perfil.visualizado_pela_equipe', entidade: { tipo: 'perfil', id: userId }, alvoUserId: userId }, req);
    res.json({
      perfil: saidaPerfil(doc, u, { coordenacao: true }),
      completude: calcularCompletude(doc, { email: u.email }),
      menorDeIdade: doc?.menorDeIdade === true,
      basesLegais: BASES_LEGAIS,
      versao: doc?.versao ?? 0
    });
  });

  admin.put('/usuarios/:userId/perfil', async (req, res) => {
    const u = await alvoDaCoordenacao(req);
    const motivo = lerTexto(req.body || {}, 'motivo', { min: 10, max: 500, obrigatorio: true, multilinha: true });
    await gravarPerfil(req, u, req.body, { coordenacao: true, motivo });
    const doc = await lerPerfil(String(u._id));
    const atualizado = await recarregarUsuario(u);
    res.json({ perfil: saidaPerfil(doc, atualizado, { coordenacao: true }), completude: calcularCompletude(doc, { email: atualizado.email }), menorDeIdade: doc?.menorDeIdade === true, versao: doc?.versao ?? 0 });
  });

  return { aluno, admin, consentimentos };
}

/** Avisos do grupo `aviso` ligados ao perfil (id fixo `perfil-incompleto`, §4.4). */
export function criarAvisoPerfilIncompleto({ repo }) {
  return {
    id: 'perfil-incompleto',
    async gerar(req) {
      if (!req?.user) return [];
      const doc = await repo('perfis').findOne({ userId: String(req.user._id) });
      const { completo } = calcularCompletude(doc, { email: req.user.email });
      if (completo) return [];
      return [{ id: 'perfil-incompleto', tom: 'info', texto: 'Complete o seu cadastro para emitir contratos, declarações e certificados.', href: 'perfil.html', rotulo: 'Completar cadastro', dispensavel: true }];
    }
  };
}

const ROTULOS_GENERO = Object.freeze({ feminino: 'Feminino', masculino: 'Masculino', nao_binario: 'Não binário', outro: 'Outro' });
const ROTULOS_ETNIA = Object.freeze({ branca: 'Branca', preta: 'Preta', parda: 'Parda', amarela: 'Amarela', indigena: 'Indígena' });
const ROTULOS_DIVERSIDADE = Object.freeze({ genero: ROTULOS_GENERO, etnia: ROTULOS_ETNIA });
export const MINIMO_CELULA = 5;

/** Valor que entra na contagem do relatório (autorizado e numa categoria contada) ou null. */
function valorContavel(perfil, espelho, campo) {
  const v = perfil?.[campo];
  return espelho?.[campo]?.aceito === true && typeof v === 'string' && Object.hasOwn(ROTULOS_DIVERSIDADE[campo], v) ? v : null;
}

/**
 * Relatório `diversidade` (grupo `relatorio`, §6.11.3): contagens por gênero e por etnia, SÓ de quem
 * autorizou (consentimento vigente no espelho), sem "prefiro não informar"; células < 5 → '<5'.
 * Só coordenação e só JSON (nenhum dado individual sai daqui).
 *
 * RETRATO, não tempo real (achado G2, §9.8): cada dimensão sai do último retrato gravado em
 * `diversidade_retratos` (só os totais já publicados, sem id de ninguém). Um retrato novo só é feito
 * num mês posterior ao do último E quando pelo menos MINIMO_CELULA pessoas tiveram mudança que afeta
 * a contagem desde ele (`perfis.diversidadeAlteradaEm.<campo>`, marcado por perfil.js e pelo serviço
 * de consentimentos). Assim a diferença entre dois retratos nunca isola uma pessoa: mesmo sabendo
 * quem mexeu no cadastro e quando, sobram pelo menos 5 candidatas para cada mudança.
 */
export function criarRelatorioDiversidade({ repo, agora = () => new Date() }) {
  const DIMENSOES = Object.freeze([
    Object.freeze({ campo: 'genero', dimensao: 'Gênero', rotulos: ROTULOS_GENERO }),
    Object.freeze({ campo: 'etnia', dimensao: 'Cor ou etnia (IBGE)', rotulos: ROTULOS_ETNIA })
  ]);
  async function contar({ campo, rotulos }) {
    const docs = await repo('perfis').find(
      { [campo]: { $in: Object.keys(rotulos) }, [`consentimentos.${campo}.aceito`]: true },
      { projection: { [campo]: 1 } }
    ).toArray();
    const n = Object.fromEntries(Object.keys(rotulos).map(k => [k, 0]));
    for (const d of docs) if (Object.hasOwn(n, d[campo])) n[d[campo]]++;
    return Object.entries(rotulos).map(([k, rotulo]) => ({ categoria: rotulo, pessoas: n[k] >= MINIMO_CELULA ? n[k] : '<5' }));
  }
  async function retrato(dim, t) {
    const col = repo('diversidade_retratos');
    const periodo = hojeSP(t).slice(0, 7);
    const [ultimo] = await col.find({ dimensao: dim.campo }, { sort: { periodo: -1 }, limit: 1 }).toArray();
    if (ultimo && ultimo.periodo >= periodo) return ultimo;
    if (ultimo) {
      const mudaram = await repo('perfis').countDocuments({ [`diversidadeAlteradaEm.${dim.campo}`]: { $gt: ultimo.geradoEm } });
      if (mudaram < MINIMO_CELULA) return ultimo;
    }
    const _id = `${dim.campo}:${periodo}`;
    const novo = { dimensao: dim.campo, periodo, geradoEm: t, celulas: await contar(dim) };
    try {
      // Duas leituras ao mesmo tempo: fica o primeiro retrato gravado no período.
      await col.updateOne({ _id }, { $setOnInsert: novo }, { upsert: true });
    } catch (err) { if (err?.code !== 11000) throw err; }
    return (await col.findOne({ _id })) || novo;
  }
  return {
    id: 'diversidade',
    titulo: 'Diversidade (estatística agregada, só de quem autorizou)',
    descricao: 'Retrato mensal, não em tempo real: os totais só mudam no mês seguinte e quando pelo menos 5 pessoas alteraram a informação desde o retrato anterior. Só de quem autorizou; grupos com menos de 5 pessoas aparecem como "<5".',
    papeis: ['admin'],
    formatos: ['json'],
    filtros: [],
    colunas: [
      { chave: 'dimensao', rotulo: 'Dimensão', tipo: 'texto' },
      { chave: 'categoria', rotulo: 'Categoria', tipo: 'texto' },
      { chave: 'pessoas', rotulo: 'Pessoas', tipo: 'texto' },
      { chave: 'retratoDe', rotulo: 'Retrato de', tipo: 'data' }
    ],
    async consultar() {
      const t = agora();
      const linhas = [];
      for (const dim of DIMENSOES) {
        const r = await retrato(dim, t);
        const retratoDe = iso(r.geradoEm instanceof Date ? r.geradoEm : new Date(r.geradoEm));
        for (const c of Array.isArray(r.celulas) ? r.celulas : []) linhas.push({ dimensao: dim.dimensao, categoria: c.categoria, pessoas: c.pessoas, retratoDe });
      }
      return linhas;
    }
  };
}

/** Montagem no agregador (API §5.1). */
export default async function montar(ctx) {
  const c = ctx.comum;
  const leitor = Object.freeze({ tentar: n => ctx.servicos.tentar(n), obter: n => ctx.servicos.obter(n), todos: g => [...new Set(ctx.servicos.todos(g))] });
  criarRotaPerfil({
    aluno: ctx.rotas.aluno, admin: ctx.rotas.admin, repo: c.repo, auditoria: c.auditoria, servicos: leitor, contador: c.contador,
    arquivos: c.arquivos, email: c.email, configPortal: c.configPortal, agora: c.agora, throttle: c.throttle, cripto: c.cifra || null, log: c.log
  });
  ctx.servicos.adicionar('aviso', criarAvisoPerfilIncompleto({ repo: c.repo }));
  ctx.servicos.adicionar('relatorio', criarRelatorioDiversidade({ repo: c.repo, agora: c.agora }));
}
