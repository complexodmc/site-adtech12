// =============================================================
// COMPLEXO DMC · Apoio de teste — fixtures do portal (banco em memória)
// PORTAL-API §9.1 · dono: F0a.
//
// semear(banco) grava, SÓ no banco em memória (nunca em Mongo real):
//   curso-01 (sigla APE, 2 módulos × 3 aulas, 1 aula "em breve"),
//   curso-02 (sem sigla, 1 módulo × 2 aulas), turmas T1 e T2 do curso-01,
//   usuários u-admin, u-prof (docência geral curso-01), u-prof-t1 (docência
//   só da T1), u-aluno1 (liberado curso-01, matrícula na T1), u-aluno2
//   (liberado curso-01, matrícula na T2), u-intruso (sem liberação), u-ex
//   (professor rebaixado com docência gravada), u-temp (senha temporária),
//   u-2fa (2FA ativo, segredo cifrado).
// Nomes e e-mails são fictícios (domínio .invalid). Senha de todas as
// contas: SENHA_FIXTURE (hash bcrypt de custo baixo, só para teste).
// =============================================================
import bcrypt from 'bcryptjs';
import { ObjectId } from 'mongodb';
import { criarCripto } from '../../src/portal/cripto.js';
import { aadDoSegredo, base32Codificar } from '../../src/portal/totp.js';
import { bytesFixos } from './falsos.js';

export const MATERIAL_TESTE = 'segredo-de-teste';
export const SENHA_FIXTURE = 'senha-de-teste-123';
export const AGORA_FIXTURE = '2026-10-18T12:00:00.000Z';

/** Hex fixos (ObjectId) por nome de fixture. `userId` gravado = este hex (string). */
export const IDS = Object.freeze({
  'u-admin': '000000000000000000000a01',
  'u-prof': '000000000000000000000a02',
  'u-prof-t1': '000000000000000000000a03',
  'u-aluno1': '000000000000000000000a04',
  'u-aluno2': '000000000000000000000a05',
  'u-intruso': '000000000000000000000a06',
  'u-ex': '000000000000000000000a07',
  'u-temp': '000000000000000000000a08',
  'u-2fa': '000000000000000000000a09',
  T1: '000000000000000000000b01',
  T2: '000000000000000000000b02',
  'mat-aluno1': '000000000000000000000c01',
  'mat-aluno2': '000000000000000000000c02',
  'doc-prof': '000000000000000000000d01',
  'doc-prof-t1': '000000000000000000000d02',
  'doc-ex': '000000000000000000000d03',
  '2fa-u-2fa': '000000000000000000000e01'
});

export const NOMES_USUARIOS = Object.freeze(['u-admin', 'u-prof', 'u-prof-t1', 'u-aluno1', 'u-aluno2', 'u-intruso', 'u-ex', 'u-temp', 'u-2fa']);

/** Segredo TOTP fixo (base32) da conta u-2fa. */
export const SEGREDO_TOTP_FIXTURE = base32Codificar(bytesFixos('totp-u-2fa')(20));

/** Códigos de recuperação da u-2fa (em claro; o banco guarda só o HMAC). */
export const CODIGOS_RECUPERACAO_FIXTURE = Object.freeze(['ABCD-EFGH', 'JKLM-NPQR', 'STUV-WXYZ', '2345-6789', 'A2B3-C4D5', 'E6F7-G8H9', 'J2K3-L4M5', 'N6P7-Q8R9', 'S2T3-U4V5', 'W6X7-Y8Z9']);

/** Id (hex) de uma fixture; aceita o próprio hex. */
export function idDe(nome) {
  if (Object.hasOwn(IDS, nome)) return IDS[nome];
  if (/^[a-f0-9]{24}$/.test(String(nome))) return String(nome);
  throw new Error(`fixtures-portal: fixture desconhecida (${nome})`);
}

export const oid = nome => new ObjectId(idDe(nome));

let hashCache = null;
function hashSenhaFixture() {
  if (!hashCache) hashCache = bcrypt.hashSync(SENHA_FIXTURE, 4);
  return hashCache;
}

function usuario(nome, campos, agora) {
  const slug = nome.replace(/^u-/, '');
  return {
    _id: oid(nome),
    email: `${slug}@exemplo.invalid`,
    senhaHash: hashSenhaFixture(),
    nome: campos.nome,
    isAdmin: false,
    createdAt: new Date(agora.getTime() - 30 * 24 * 3600 * 1000),
    ...campos
  };
}

function aula(id, moduloId, ordem, extras = {}) {
  return { _id: id, moduloId, titulo: `Aula ${ordem} de teste`, duracao: '20 min', videoUrl: `https://player.vimeo.com/video/10000${ordem}`, ordem, ...extras };
}

/**
 * Semeia o banco em memória e devolve os dados gravados.
 * @param {object} banco criarBancoMemoria()
 * @param {{ agora?: Date, material?: string }} opcoes
 */
export async function semear(banco, { agora = new Date(AGORA_FIXTURE), material = MATERIAL_TESTE } = {}) {
  const cripto = criarCripto({ material });
  const db = nome => banco.collection(nome);
  const dia = 24 * 3600 * 1000;

  const cursos = [
    { _id: 'curso-01', titulo: 'Curso de Teste APE', subtitulo: '', descricao: '', cargaHoraria: '12h', modalidade: 'Online', preco: 0, ordem: 1, isAtivo: true, sigla: 'APE' },
    { _id: 'curso-02', titulo: 'Curso de Teste Sem Sigla', subtitulo: '', descricao: '', cargaHoraria: '4h', modalidade: 'Online', preco: 0, ordem: 2, isAtivo: true }
  ];
  const modulos = [
    { _id: 'c01-m01', cursoId: 'curso-01', numero: '01', titulo: 'Módulo 1', resumo: '', duracao: '1h', ordem: 1 },
    { _id: 'c01-m02', cursoId: 'curso-01', numero: '02', titulo: 'Módulo 2', resumo: '', duracao: '1h', ordem: 2 },
    { _id: 'c02-m01', cursoId: 'curso-02', numero: '01', titulo: 'Módulo único', resumo: '', duracao: '40 min', ordem: 1 }
  ];
  const aulas = [
    aula('c01-m01-a01', 'c01-m01', 1), aula('c01-m01-a02', 'c01-m01', 2), aula('c01-m01-a03', 'c01-m01', 3),
    aula('c01-m02-a01', 'c01-m02', 1), aula('c01-m02-a02', 'c01-m02', 2),
    aula('c01-m02-a03', 'c01-m02', 3, { disponivel: false, videoUrl: '' }), // "em breve"
    aula('c02-m01-a01', 'c02-m01', 1), aula('c02-m01-a02', 'c02-m01', 2)
  ];

  const usuarios = [
    usuario('u-admin', { nome: 'Coordenação de Teste', isAdmin: true, papel: 'admin', emailVerificadoEm: agora }, agora),
    usuario('u-prof', { nome: 'Professora Geral de Teste', papel: 'professor', emailVerificadoEm: agora }, agora),
    usuario('u-prof-t1', { nome: 'Professor da Turma Um', papel: 'professor', emailVerificadoEm: agora }, agora),
    usuario('u-aluno1', { nome: 'Aluna Um de Teste', papel: 'aluno' }, agora),
    usuario('u-aluno2', { nome: 'Aluno Dois de Teste', papel: 'aluno' }, agora),
    usuario('u-intruso', { nome: 'Pessoa Sem Acesso' }, agora), // sem `papel` (conta antiga): derivado
    usuario('u-ex', { nome: 'Ex-professor de Teste', papel: 'aluno', papelAtualizadoEm: new Date(agora.getTime() - 2 * dia), papelAtualizadoPor: IDS['u-admin'] }, agora),
    usuario('u-temp', { nome: 'Conta com Senha Temporária', papel: 'aluno', senhaTemporaria: true, senhaTemporariaExpiraEm: new Date(agora.getTime() + 72 * 3600 * 1000), credencialRedefinidaPelaCoordenacaoEm: agora }, agora),
    usuario('u-2fa', { nome: 'Conta com Verificação em Duas Etapas', papel: 'aluno', doisFatoresAtivo: true, emailVerificadoEm: agora }, agora)
  ];

  const turmas = [
    { _id: oid('T1'), cursoId: 'curso-01', codigo: 'APE-2026-01', nome: 'Turma 1', inicio: '2026-08-01', fim: null, modalidade: 'hibrido', encerradaEm: null, versao: 1, criadoEm: agora, atualizadoEm: agora, criadoPor: IDS['u-admin'] },
    { _id: oid('T2'), cursoId: 'curso-01', codigo: 'APE-2026-02', nome: 'Turma 2', inicio: '2026-08-01', fim: null, modalidade: 'gravado', encerradaEm: null, versao: 1, criadoEm: agora, atualizadoEm: agora, criadoPor: IDS['u-admin'] }
  ];

  const liberacoes = [
    { userId: IDS['u-aluno1'], cursoId: 'curso-01', grantedAt: new Date(agora.getTime() - 20 * dia), grantedBy: IDS['u-admin'] },
    { userId: IDS['u-aluno2'], cursoId: 'curso-01', grantedAt: new Date(agora.getTime() - 20 * dia), grantedBy: IDS['u-admin'] }
  ];

  const matricula = (nome, aluno, turma, numero) => ({
    _id: oid(nome), numero, userId: IDS[aluno], cursoId: 'curso-01', turmaId: oid(turma), status: 'ativa', vigente: true,
    inicioEm: new Date(agora.getTime() - 20 * dia), origem: 'liberacao', contratoId: null,
    enturmacoes: [{ turmaId: oid(turma), turmaCodigo: turma === 'T1' ? 'APE-2026-01' : 'APE-2026-02', de: new Date(agora.getTime() - 20 * dia), ate: null, por: IDS['u-admin'] }],
    historico: [{ status: 'ativa', em: new Date(agora.getTime() - 20 * dia), por: 'sistema' }],
    concluidaEm: null, canceladaEm: null, trancadaEm: null, resultadoFinal: null, certificadoCodigo: null, nomeEmDocumentos: null,
    versao: 1, criadoEm: new Date(agora.getTime() - 20 * dia), atualizadoEm: new Date(agora.getTime() - 20 * dia)
  });
  const matriculas = [matricula('mat-aluno1', 'u-aluno1', 'T1', 'MAT-2026-AAAAA2'), matricula('mat-aluno2', 'u-aluno2', 'T2', 'MAT-2026-AAAAA3')];

  const docencias = [
    { _id: oid('doc-prof'), userId: IDS['u-prof'], cursoId: 'curso-01', turmaId: null, criadoEm: agora, criadoPor: IDS['u-admin'] },
    { _id: oid('doc-prof-t1'), userId: IDS['u-prof-t1'], cursoId: 'curso-01', turmaId: oid('T1'), criadoEm: agora, criadoPor: IDS['u-admin'] },
    { _id: oid('doc-ex'), userId: IDS['u-ex'], cursoId: 'curso-01', turmaId: null, criadoEm: new Date(agora.getTime() - 10 * dia), criadoPor: IDS['u-admin'] }
  ];

  const auth2fa = [{
    _id: oid('2fa-u-2fa'),
    userId: IDS['u-2fa'],
    ativo: true,
    segredo: cripto.cifrar(SEGREDO_TOTP_FIXTURE, 'totp', aadDoSegredo(IDS['u-2fa'])),
    pendente: null,
    pendenteCriadoEm: null,
    ativadoEm: new Date(agora.getTime() - 5 * dia),
    ultimoPasso: 0,
    codigos: CODIGOS_RECUPERACAO_FIXTURE.map(c => ({ hash: cripto.hmacCodigoRecuperacao(c), usadoEm: null }))
  }];

  for (const [nome, docs] of Object.entries({ cursos, modulos, aulas, users: usuarios, turmas, liberacoes, matriculas, docencias, auth_2fa: auth2fa })) {
    await db(nome).insertMany(docs.map(d => ({ ...d })));
  }

  return { cursos, modulos, aulas, usuarios, turmas, liberacoes, matriculas, docencias, auth2fa, cripto, agora };
}
