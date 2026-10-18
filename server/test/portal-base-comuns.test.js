// Portal · F0m — serviços comuns: notificacoes, arquivos (casos da PORTAL-API §9.3,
// linha portal-base-comuns, D-59), e também auditoria (executar que falha → 503 e
// nada muda), limitador, e-mail, acesso/equipe, perfis-leitura e o localizador de
// serviços com os executores dos grupos. Nenhum Mongo, nenhuma rede.
// Rode com `npm test` na raiz.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import express from 'express';
import { ObjectId } from 'mongodb';

import { criarBancoMemoria } from './apoio/banco-memoria.js';
import { semear, IDS, oid } from './apoio/fixtures-portal.js';
import { subir, fechar, cliente } from './apoio/http.js';
import {
  silencioso, criarLogEspiao, relogio, fetchFalso, montarPdf, pdfMinimo, pdfComJavascript, pngMinimo, pngComTexto,
  jpegMinimo, jpegComExif, webpMinimo, webpComExif, htmlDisfarcado, gerarCpfValido
} from './apoio/falsos.js';

import { especificacoesRegistradas } from '../src/portal/indices.js';
import {
  criarServicos, criarLoteDeServicos, ServicoIndisponivel, executarAvisos, executarBusca, montarPainel, validadorDoCodigo,
  exportarDoTitular, relatoriosDoPapel, relatorioPorId, dispararAoConcluirAula, bloqueiosEmCascata, apagarEmCascata, GRUPOS
} from '../src/portal/servicos.js';
import { criarServicoNotificacoes, INTERVALO_VARREDURA_MS } from '../src/portal/notificacoes.js';
import {
  detectarTipo, pdfTemConteudoAtivo, normalizarNomesPdf, removerMetadadosImagem, lerCorpoBinario, criarArquivos, nomeDeDownload
} from '../src/portal/arquivos.js';
import { criarAuditoria, calcularMudancas, campoSensivel, MASCARA } from '../src/portal/auditoria.js';
import { criarContadorPersistente, limitePersistente, conferirSenhaAtual, chaveUsuario } from '../src/portal/limitador.js';
import { criarEnviadorEmail, MODELOS, montarLinkDeAcesso, RODAPE_SEGURANCA, mascararEmail } from '../src/portal/email.js';
import { criarAcesso } from '../src/portal/acesso.js';
import { criarPerfisLeitura, calcularCompletude } from '../src/portal/perfis-leitura.js';
import { ErroPortal, criarTratadorErroPortal, criarTratarErroGlobal } from '../src/portal/erros.js';
import { conferirAlvoQa, CONTAS_QA } from '../scripts/seed-portal-qa.js';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const novoBanco = () => criarBancoMemoria({ indices: especificacoesRegistradas() });
const repoDe = banco => nome => banco.collection(nome);
async function bancoSemeado() {
  const banco = novoBanco();
  await semear(banco);
  return banco;
}
const usuario = (banco, nome) => banco.collection('users').findOne({ _id: oid(nome) });
const reqDe = async (banco, nome, extra = {}) => ({ user: nome ? await usuario(banco, nome) : undefined, ip: '203.0.113.77', ...extra });

// =============================================================
describe('notificacoes.js', () => {
  test('emitir: idempotente por chave (uq_not_chave), tetos de texto, link interno validado e expiração pela retenção', async () => {
    const banco = novoBanco();
    const r = relogio('2026-10-18T12:00:00Z');
    const n = criarServicoNotificacoes({ repo: repoDe(banco), agora: r, log: silencioso, retencaoDias: async () => 30 });
    const base = { userIds: ['u1', 'u2', 'u1'], tipo: 'contrato.disponivel', titulo: 'T'.repeat(150), texto: 'x'.repeat(400), link: 'contrato.html?id=abc', chave: 'contrato:abc:disponivel' };
    assert.deepEqual(await n.emitir(base), { inseridas: 2 }, 'userIds sem repetição');
    assert.deepEqual(await n.emitir(base), { inseridas: 0 }, 'mesma chave: idempotente');
    const docs = banco.documentos('notificacoes');
    assert.equal(docs.length, 2);
    assert.ok(docs.every(d => d.titulo.length <= 100 && d.texto.length <= 280 && d.lida === false && d.lidaEm === null));
    assert.equal(docs[0].link, 'contrato.html?id=abc');
    assert.equal(docs[0].expiraEm.getTime() - docs[0].criadaEm.getTime(), 30 * 86400000);
    // sem chave: não há dedupe
    await n.emitir({ userIds: ['u1'], tipo: 'lancamento.criado', titulo: 'Novo lançamento', texto: '', chave: null });
    await n.emitir({ userIds: ['u1'], tipo: 'lancamento.criado', titulo: 'Novo lançamento', texto: '', chave: null });
    assert.equal(banco.documentos('notificacoes').length, 4);
  });

  test('emitir nunca lança: banco fora, tipo inválido, sem título, link externo (descartado)', async () => {
    const banco = novoBanco();
    const log = criarLogEspiao();
    const n = criarServicoNotificacoes({ repo: repoDe(banco), log });
    banco.falhar.insertMany = true;
    assert.deepEqual(await n.emitir({ userIds: ['u1'], tipo: 'protocolo.respondido', titulo: 'Resposta' }), { inseridas: 0 });
    banco.falhar.insertMany = false;
    assert.deepEqual(await n.emitir({ userIds: ['u1'], tipo: 'Tipo Ruim', titulo: 'x' }), { inseridas: 0 });
    assert.deepEqual(await n.emitir({ userIds: ['u1'], tipo: 'protocolo.respondido', titulo: '   ' }), { inseridas: 0 });
    assert.deepEqual(await n.emitir({ userIds: [], tipo: 'protocolo.respondido', titulo: 'x' }), { inseridas: 0 });
    assert.deepEqual(await n.emitir({ userIds: ['u1'], tipo: 'protocolo.respondido', titulo: 'x', link: 'https://evil.example/x' }), { inseridas: 1 });
    assert.equal(banco.documentos('notificacoes')[0].link, null);
    assert.ok(log.linhas.length >= 3);
    assert.doesNotMatch(log.texto(), /evil\.example/);
  });

  test('emitir espera a garantia de índices antes da 1ª escrita (só uma vez)', async () => {
    const banco = novoBanco();
    let chamadas = 0;
    const n = criarServicoNotificacoes({ repo: repoDe(banco), log: silencioso, garantia: { garantir: async () => { chamadas++; } } });
    await n.emitir({ userIds: ['u1'], tipo: 'declaracao.emitida', titulo: 'Declaração emitida' });
    await n.emitir({ userIds: ['u1'], tipo: 'declaracao.emitida', titulo: 'Declaração emitida' });
    assert.equal(chamadas, 1);
  });

  test('varrer: roda o grupo sob demanda no máximo a cada 5 min por usuário; corrida → uma vez; gerador que falha não derruba', async () => {
    // O emulador não simula o índice implícito de _id do Mongo: aqui ele entra só neste banco (pedido à F0a).
    const banco = criarBancoMemoria({
      indices: [...especificacoesRegistradas(), { colecao: 'notificacoes_estado', chave: { _id: 1 }, opcoes: { name: 'uq_teste_id_implicito', unique: true } }]
    });
    const r = relogio('2026-10-18T12:00:00Z');
    const servicos = criarServicos();
    const chamadas = [];
    servicos.adicionar('notificacaoSobDemanda', {
      tipo: 'encontro.proximo',
      gerar: async (userId, { agora, emitir }) => {
        chamadas.push([userId, agora.toISOString()]);
        await emitir({ userIds: [userId], tipo: 'encontro.proximo', titulo: 'Encontro em breve', chave: 'encontro:1:proximo' });
      }
    });
    servicos.adicionar('notificacaoSobDemanda', { tipo: 'lancamento.vencendo', gerar: async () => { throw new Error('quebrou'); } });
    const n = criarServicoNotificacoes({ repo: repoDe(banco), servicos, agora: r, log: silencioso });

    await Promise.all([n.varrer('u1'), n.varrer('u1'), n.varrer('u1')]);
    assert.equal(chamadas.length, 1, 'corrida: uma varredura');
    await n.varrer('u1');
    assert.equal(chamadas.length, 1, 'dentro de 5 min não varre');
    r.avancar(INTERVALO_VARREDURA_MS - 1000);
    await n.varrer('u1');
    assert.equal(chamadas.length, 1);
    r.avancar(2000);
    await n.varrer('u1');
    assert.equal(chamadas.length, 2, 'depois de 5 min varre de novo');
    await n.varrer('u2');
    assert.equal(chamadas.length, 3, 'por usuário');
    assert.equal(banco.documentos('notificacoes').filter(d => d.userId === 'u1').length, 1, 'chave dedupe a sob demanda');
    // banco fora: nunca lança
    banco.falhar.findOneAndUpdate = true;
    r.avancar(INTERVALO_VARREDURA_MS + 1);
    await assert.doesNotReject(n.varrer('u1'));
  });
});

// =============================================================
describe('arquivos.js — tipo pelos bytes', () => {
  test('detectarTipo: pdf/jpg/png/webp; gif, html disfarçado e vazio → null', () => {
    assert.equal(detectarTipo(pdfMinimo()), 'pdf');
    assert.equal(detectarTipo(jpegMinimo()), 'jpg');
    assert.equal(detectarTipo(pngMinimo()), 'png');
    assert.equal(detectarTipo(webpMinimo()), 'webp');
    assert.equal(detectarTipo(Buffer.from('GIF89a\x01\x00\x01\x00', 'latin1')), null);
    assert.equal(detectarTipo(htmlDisfarcado()), null);
    assert.equal(detectarTipo(Buffer.alloc(0)), null);
    assert.equal(detectarTipo(null), null);
    assert.equal(detectarTipo(Buffer.from(' %PDF-1.4', 'latin1')), null, 'cabeçalho no byte 0');
  });
});

describe('arquivos.js — PDF com conteúdo ativo', () => {
  const catalogo = '<< /Type /Catalog /Pages 2 0 R >>';
  const paginas = '<< /Type /Pages /Kids [3 0 R] /Count 1 >>';
  const pagina = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>';
  const comStream = (dic, dados) => `${dic.replace('>>', ` /Length ${dados.length} >>`)}\nstream\n${dados.toString('latin1')}\nendstream`;

  test('aceitos: PDF mínimo, /OpenAction [3 0 R /Fit] e conteúdo comprimido inofensivo', () => {
    assert.deepEqual(pdfTemConteudoAtivo(pdfMinimo()), { ativo: false, motivo: null });
    const fit = montarPdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction [3 0 R /Fit] >>', paginas, pagina]);
    assert.equal(pdfTemConteudoAtivo(fit).ativo, false);
    const conteudo = zlib.deflateSync(Buffer.from('BT /F1 12 Tf 72 712 Td (Declaração de teste com /JSON e /JavaScriptX) Tj ET'));
    const pdf = montarPdf([catalogo, paginas, pagina, comStream('<< /Filter /FlateDecode >>', conteudo)]);
    assert.equal(pdfTemConteudoAtivo(pdf).ativo, false, '/JSON e /JavaScriptX não são /JS nem /JavaScript');
    const uri = montarPdf(['<< /Type /Catalog /Pages 2 0 R /OpenAction << /S /URI /URI (https://complexodmc.com.br) >> >>', paginas, pagina]);
    assert.equal(pdfTemConteudoAtivo(uri).ativo, false, 'ação de navegação passa');
  });

  test('ativos: vetores da API §9.3', () => {
    const casos = {
      'J#61vaScript (nome com #xx)': montarPdf([catalogo, paginas, pagina, '<< /S /J#61vaScript /J#53 (app.alert\\(1\\)) >>']),
      '/OpenAction com /S /JavaScript': pdfComJavascript(),
      '/Encrypt': montarPdf(['<< /Type /Catalog /Pages 2 0 R /Encrypt 4 0 R >>', paginas, pagina, '<< /Filter /Standard /V 1 >>']),
      '/AA com /S /Launch': montarPdf([catalogo, paginas, '<< /Type /Page /Parent 2 0 R /AA << /O << /S /Launch /F (calc.exe) >> >> >>']),
      '/XFA': montarPdf(['<< /Type /Catalog /Pages 2 0 R /AcroForm << /XFA 4 0 R >> >>', paginas, pagina, '<< >>']),
      '/SubmitForm': montarPdf([catalogo, paginas, pagina, '<< /S /SubmitForm /F (https://exemplo.invalid) >>']),
      '/GoToR': montarPdf([catalogo, paginas, pagina, '<< /S /GoToR /F (outro.pdf) /D [0 /Fit] >>']),
      '/ImportData': montarPdf([catalogo, paginas, pagina, '<< /S /ImportData /F (dados.fdf) >>']),
      '/EmbeddedFile': montarPdf([catalogo, paginas, pagina, '<< /Type /EmbeddedFile >>'])
    };
    for (const [rotulo, pdf] of Object.entries(casos)) assert.equal(pdfTemConteudoAtivo(pdf).ativo, true, rotulo);
    assert.equal(pdfTemConteudoAtivo(casos['J#61vaScript (nome com #xx)']).motivo, 'JavaScript');
    assert.equal(normalizarNomesPdf('/J#61vaScript /J#53'), '/JavaScript /JS');
  });

  test('JavaScript dentro de /ObjStm comprimido com FlateDecode → ativo; ObjStm sem filtro também; com filtro que não abre → objstm-ilegivel', () => {
    const objetos = Buffer.from('4 0 << /S /JavaScript /JS (app.alert\\(1\\)) >>');
    const comp = zlib.deflateSync(objetos);
    const flate = montarPdf([catalogo, paginas, pagina, comStream('<< /Type /ObjStm /N 1 /First 4 /Filter /FlateDecode >>', comp)]);
    assert.doesNotMatch(flate.toString('latin1'), /JavaScript/, 'o texto não aparece cru');
    assert.deepEqual(pdfTemConteudoAtivo(flate), { ativo: true, motivo: 'JavaScript' });
    const cru = montarPdf([catalogo, paginas, pagina, comStream('<< /Type /ObjStm /N 1 /First 4 >>', objetos)]);
    assert.equal(pdfTemConteudoAtivo(cru).ativo, true);
    const hex = montarPdf([catalogo, paginas, pagina, comStream('<< /Type /ObjStm /N 1 /First 4 /Filter /ASCIIHexDecode >>', Buffer.from(objetos.toString('hex') + '>'))]);
    assert.deepEqual(pdfTemConteudoAtivo(hex), { ativo: true, motivo: 'objstm-ilegivel' });
  });

  test('bomba de compressão → ativo (motivo compressao), sem estourar memória', () => {
    const bomba = zlib.deflateSync(Buffer.alloc(40 * 1024 * 1024));
    const pdf = montarPdf([catalogo, paginas, pagina, comStream('<< /Filter /FlateDecode >>', bomba)]);
    assert.deepEqual(pdfTemConteudoAtivo(pdf), { ativo: true, motivo: 'compressao' });
    // teto total também vale para vários streams moderados
    const medio = zlib.deflateSync(Buffer.alloc(900 * 1024, 0x20));
    const muitos = montarPdf([catalogo, paginas, pagina, ...Array.from({ length: 6 }, () => comStream('<< /Filter /FlateDecode >>', medio))]);
    assert.deepEqual(pdfTemConteudoAtivo(muitos, { tetoDescomprimido: 4 * 1024 * 1024 }), { ativo: true, motivo: 'compressao' });
  });

  test('dado binário de imagem não é descomprimido nem varrido (sem falso positivo)', () => {
    const img = zlib.deflateSync(Buffer.from('\x00\x01/JS \x02\x03', 'latin1'));
    const pdf = montarPdf([catalogo, paginas, pagina, comStream('<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /Filter /FlateDecode >>', img)]);
    assert.equal(pdfTemConteudoAtivo(pdf).ativo, false);
  });
});

describe('arquivos.js — metadados de imagem', () => {
  test('JPEG: APP1/Exif sai, SOI/EOI e o resto ficam', () => {
    const limpo = removerMetadadosImagem(jpegComExif(), 'jpg');
    assert.ok(!limpo.includes(Buffer.from('Exif\0\0', 'latin1')));
    assert.deepEqual([limpo[0], limpo[1]], [0xff, 0xd8]);
    assert.deepEqual([limpo.at(-2), limpo.at(-1)], [0xff, 0xd9]);
    assert.ok(limpo.equals(jpegMinimo()), 'igual ao JPEG sem o APP1');
    assert.ok(removerMetadadosImagem(jpegMinimo(), 'jpg').equals(jpegMinimo()), 'sem metadado: inalterado');
  });

  test('PNG: tEXt e eXIf saem; o resto fica', () => {
    const limpo = removerMetadadosImagem(pngComTexto(), 'png');
    assert.ok(!limpo.includes(Buffer.from('tEXt', 'latin1')) && !limpo.includes(Buffer.from('eXIf', 'latin1')));
    assert.ok(limpo.equals(pngMinimo()));
  });

  test('WebP: EXIF e XMP saem, flags do VP8X zeradas, tamanho RIFF coerente', () => {
    const limpo = removerMetadadosImagem(webpComExif(), 'webp');
    assert.equal(detectarTipo(limpo), 'webp');
    assert.ok(!limpo.includes(Buffer.from('EXIF', 'latin1')) && !limpo.includes(Buffer.from('XMP ', 'latin1')));
    assert.equal(limpo.readUInt32LE(4), limpo.length - 8);
    const i = limpo.indexOf(Buffer.from('VP8X', 'latin1'));
    assert.equal(limpo[i + 8] & 0x0c, 0);
  });

  test('estrutura corrompida → 415 tipo-de-arquivo', () => {
    const quebrado = Buffer.concat([jpegMinimo().subarray(0, 30)]);
    assert.throws(() => removerMetadadosImagem(quebrado, 'jpg'), e => e instanceof ErroPortal && e.status === 415);
    assert.throws(() => removerMetadadosImagem(pngMinimo().subarray(0, 20), 'png'), e => e.status === 415);
  });
});

describe('arquivos.js — entrada (lerCorpoBinario) e repositório', () => {
  async function subirUpload(opcoes) {
    const app = express();
    app.post('/up', ...lerCorpoBinario(opcoes), (req, res) => res.json({ tipo: req.arquivo.tipo, tamanho: req.arquivo.buf.length }));
    app.use(criarTratadorErroPortal({ log: silencioso }));
    app.use(criarTratarErroGlobal({ log: silencioso }));
    return subir(app);
  }

  test('PDF aceito; PDF ativo 415; HTML disfarçado 415; vazio 415; acima do teto 413 — o Content-Type do cliente é ignorado', async () => {
    const { server, base } = await subirUpload({ limiteBytes: 4096, tipos: ['pdf'] });
    const api = cliente(base);
    try {
      const ok = await api.post('/up', undefined, { corpoCru: pdfMinimo(), tipo: 'image/png' });
      assert.equal(ok.status, 200);
      assert.equal(ok.corpo.tipo, 'pdf');
      const ativo = await api.post('/up', undefined, { corpoCru: pdfComJavascript(), tipo: 'application/pdf' });
      assert.equal(ativo.status, 415);
      assert.equal(ativo.corpo.codigo, 'pdf-ativo');
      const html = await api.post('/up', undefined, { corpoCru: htmlDisfarcado(), tipo: 'application/pdf' });
      assert.equal(html.corpo.codigo, 'tipo-de-arquivo');
      const vazio = await api.post('/up', undefined, { corpoCru: Buffer.alloc(0), tipo: 'application/pdf' });
      assert.equal(vazio.status, 415);
      const png = await api.post('/up', undefined, { corpoCru: pngMinimo(), tipo: 'application/pdf' });
      assert.equal(png.status, 415, 'tipo fora da lista');
      const grande = await api.post('/up', undefined, { corpoCru: Buffer.concat([pdfMinimo(), Buffer.alloc(8192, 0x20)]), tipo: 'application/pdf' });
      assert.equal(grande.status, 413);
      assert.equal(grande.corpo.codigo, 'arquivo-grande');
    } finally { await fechar(server); }
  });

  test('salvar / metadados / ler com filtro OBRIGATÓRIO no mesmo find (IDOR) / apagar', async () => {
    const banco = novoBanco();
    const arq = criarArquivos({ repo: repoDe(banco), agora: relogio() });
    const s = await arq.salvar({ contexto: 'documento', donoUserId: 'u1', ref: { entidadeId: 'e1', cursoId: 'c1' }, buf: pdfMinimo(), tipo: 'pdf', nomeDownload: 'Declaração de matrícula.pdf', por: 'u1' });
    assert.match(s.id, /^[a-f0-9]{24}$/);
    assert.match(s.sha256, /^[a-f0-9]{64}$/);
    assert.equal(s.mime, 'application/pdf');
    const doc = banco.documentos('arquivos')[0];
    assert.deepEqual(doc.ref, { entidadeId: 'e1' }, 'ref.cursoId só em material');
    assert.equal(doc.nomeDownload, 'Declaracao-de-matricula.pdf');

    await assert.rejects(arq.metadados(s.id), TypeError);
    await assert.rejects(arq.ler(s.id), TypeError);
    await assert.rejects(arq.ler(s.id, { donoUserId: 'u1' }), TypeError, 'sem contexto');
    await assert.rejects(arq.ler(s.id, { contexto: 'documento', _id: s.id }), TypeError);
    assert.equal(await arq.metadados(s.id, { contexto: 'material' }), null, 'id de documento pedido como material → nada');
    assert.equal(await arq.ler(s.id, { contexto: 'documento', donoUserId: 'u2' }), null, 'dono errado → nada');
    const meta = await arq.metadados(s.id, { contexto: 'documento', donoUserId: 'u1' });
    assert.equal(meta.dados, undefined, 'metadados sem binário');
    const lido = await arq.ler(s.id, { contexto: 'documento', 'ref.entidadeId': 'e1' });
    assert.ok(lido.dados.equals(pdfMinimo()));
    assert.equal(await arq.ler('id-invalido', { contexto: 'documento' }), null);

    await assert.rejects(arq.salvar({ contexto: 'documento', buf: pngMinimo(), tipo: 'pdf', nomeDownload: 'x' }), TypeError, 'tipo não confere');
    await assert.rejects(arq.salvar({ contexto: 'outro', buf: pdfMinimo(), tipo: 'pdf' }), TypeError);
    const mat = await arq.salvar({ contexto: 'material', ref: { cursoId: 'c1', moduloId: 'm1' }, buf: pdfMinimo(), tipo: 'pdf', nomeDownload: 'apostila' });
    assert.deepEqual(banco.documentos('arquivos')[1].ref, { cursoId: 'c1', moduloId: 'm1' });
    await arq.apagar(mat.id);
    assert.equal(banco.documentos('arquivos').length, 1);
  });

  test('enviar: cabeçalhos de §1.6 (privado e público); PDF nunca inline; imagem inline', async () => {
    const banco = novoBanco();
    const arq = criarArquivos({ repo: repoDe(banco) });
    const pdf = await arq.salvar({ contexto: 'contrato', donoUserId: 'u1', buf: pdfMinimo(), tipo: 'pdf', nomeDownload: 'contrato' });
    const img = await arq.salvar({ contexto: 'banner', buf: pngMinimo(), tipo: 'png', nomeDownload: 'banner' });
    const app = express();
    app.get('/pdf', async (_q, res) => arq.enviar(res, await arq.ler(pdf.id, { contexto: 'contrato', donoUserId: 'u1' }), { inline: true }));
    app.get('/img', async (_q, res) => arq.enviar(res, await arq.ler(img.id, { contexto: 'banner' }), { inline: true, publico: true }));
    const { server, base } = await subir(app);
    try {
      const r = await fetch(`${base}/pdf`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('content-type'), 'application/pdf');
      assert.equal(r.headers.get('cache-control'), 'private, no-store');
      assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(r.headers.get('content-security-policy'), "default-src 'none'; sandbox");
      assert.equal(r.headers.get('cross-origin-resource-policy'), 'same-origin');
      assert.equal(r.headers.get('content-disposition'), 'attachment; filename="contrato.pdf"');
      assert.ok(Buffer.from(await r.arrayBuffer()).equals(pdfMinimo()));
      const i = await fetch(`${base}/img`);
      assert.equal(i.headers.get('cache-control'), 'public, max-age=31536000, immutable');
      assert.equal(i.headers.get('content-disposition'), 'inline; filename="banner.png"');
    } finally { await fechar(server); }
    assert.equal(nomeDeDownload('../../etc/passwd', 'pdf'), 'etc-passwd.pdf');
    assert.equal(nomeDeDownload('', 'png'), 'arquivo.png');
  });
});

// =============================================================
describe('auditoria.js', () => {
  test('registrar: estado concluido, ator do req (papel e IP truncado), mudanças mascaradas; req null = sistema', async () => {
    const banco = await bancoSemeado();
    const aud = criarAuditoria({ repo: repoDe(banco), agora: relogio(), log: silencioso });
    const req = await reqDe(banco, 'u-admin');
    const id = await aud.registrar({
      acao: 'perfil.alterado_pela_equipe', entidade: { tipo: 'perfil', id: IDS['u-aluno1'] }, alvoUserId: IDS['u-aluno1'],
      mudancas: [{ campo: 'cpf', de: '111', para: '222' }, { campo: 'celular', de: null, para: '+5511987654321' }], motivo: 'Correção pedida pela aluna.'
    }, req);
    assert.match(id, /^[a-f0-9]{24}$/);
    const [doc] = banco.documentos('auditoria');
    assert.equal(doc.estado, 'concluido');
    assert.deepEqual(doc.ator, { userId: IDS['u-admin'], papel: 'admin', ipTruncado: '203.0.113.0/24' });
    assert.deepEqual(doc.mudancas[0], { campo: 'cpf', de: MASCARA, para: MASCARA });
    assert.equal(doc.mudancas[1].para, '+5511987654321');
    await aud.registrar({ acao: 'auth.tentativas_de_acesso', entidade: { tipo: 'usuario', id: 'x' } }, null);
    assert.equal(banco.documentos('auditoria')[1].ator.papel, 'sistema');
  });

  test('registrar é melhor esforço: banco fora ou evento malformado → null, sem lançar', async () => {
    const banco = novoBanco();
    const log = criarLogEspiao();
    const aud = criarAuditoria({ repo: repoDe(banco), log });
    banco.falhar.insertOne = true;
    assert.equal(await aud.registrar({ acao: 'auth.login_falha', entidade: { tipo: 'usuario', id: 'x' } }, null), null);
    banco.falhar.insertOne = false;
    assert.equal(await aud.registrar({ acao: 'sem-ponto', entidade: { tipo: 'x', id: 'y' } }, null), null);
    assert.equal(log.linhas.length, 2);
  });

  test('executar: registrado ANTES, concluido depois; mutação que falha → falhou + erro e relança', async () => {
    const banco = await bancoSemeado();
    const aud = criarAuditoria({ repo: repoDe(banco), log: silencioso });
    const req = await reqDe(banco, 'u-admin');
    const evento = { acao: 'docencia.criada', entidade: { tipo: 'docencia', id: 'd1' }, cursoId: 'curso-01' };
    let estadoDurante = null;
    const r = await aud.executar(evento, req, async () => { estadoDurante = banco.documentos('auditoria')[0].estado; return 42; });
    assert.equal(r, 42);
    assert.equal(estadoDurante, 'registrado');
    assert.equal(banco.documentos('auditoria')[0].estado, 'concluido');
    assert.ok(banco.documentos('auditoria')[0].concluidoEm instanceof Date);
    await assert.rejects(aud.executar(evento, req, async () => { throw new Error('falha com ana@exemplo.invalid'); }), /falha/);
    const d = banco.documentos('auditoria')[1];
    assert.equal(d.estado, 'falhou');
    assert.ok(d.erro.length <= 300);
    assert.doesNotMatch(d.erro, /ana@exemplo/);
  });

  test('executar com auditoria indisponível → 503 auditoria-indisponivel e a mutação NÃO roda', async () => {
    const banco = await bancoSemeado();
    const aud = criarAuditoria({ repo: repoDe(banco), log: silencioso });
    banco.falhar.insertOne = 'auditoria';
    let rodou = false;
    await assert.rejects(
      aud.executar({ acao: 'usuario.desativado', entidade: { tipo: 'usuario', id: 'x' } }, null, async () => { rodou = true; }),
      e => e instanceof ErroPortal && e.status === 503 && e.codigo === 'auditoria-indisponivel'
    );
    assert.equal(rodou, false);
    assert.equal(banco.documentos('auditoria').length, 0);
    await assert.rejects(aud.executar({ acao: 'x' }, null, async () => {}), TypeError, 'evento malformado: erro de programação');
  });

  test('mudancas(): só o que mudou, com caminhos com ponto e campos sensíveis mascarados', () => {
    const antes = { nomeRegistro: 'Ana', cpf: '1', genero: 'feminino', endereco: { cep: '01000000', cidade: 'São Paulo' }, rg: { numero: '1' }, senhaHash: 'h' };
    const depois = { nomeRegistro: 'Ana Maria', cpf: '2', genero: 'outro', endereco: { cep: '01000000', cidade: 'Campinas' }, rg: { numero: '2' }, senhaHash: 'g' };
    const m = calcularMudancas(antes, depois, ['nomeRegistro', 'cpf', 'genero', 'endereco.cep', 'endereco.cidade', 'rg.numero', 'senhaHash']);
    assert.deepEqual(m, [
      { campo: 'nomeRegistro', de: 'Ana', para: 'Ana Maria' },
      { campo: 'cpf', de: MASCARA, para: MASCARA },
      { campo: 'genero', de: MASCARA, para: MASCARA },
      { campo: 'endereco.cidade', de: 'São Paulo', para: 'Campinas' },
      { campo: 'rg.numero', de: MASCARA, para: MASCARA },
      { campo: 'senhaHash', de: MASCARA, para: MASCARA }
    ]);
    for (const c of ['passaporte.numero', 'etnia', 'fotoArquivoId', 'segredo', 'chaveCifrada', 'apiKey', 'tokenHash']) assert.ok(campoSensivel(c), c);
    for (const c of ['celular', 'nomeSocial', 'endereco.regiao', 'codigo']) assert.ok(!campoSensivel(c), c);
  });
});

// =============================================================
describe('limitador.js', () => {
  test('consumir: conta na janela, ok até o máximo, Retry-After; janela vencida reinicia mesmo sem o TTL ter removido', async () => {
    const banco = novoBanco();
    const r = relogio('2026-10-18T12:00:00Z');
    const c = criarContadorPersistente({ repo: repoDe(banco), agora: r });
    const op = { janelaMs: 60000, max: 3 };
    const res = [];
    for (let i = 0; i < 4; i++) res.push(await c.consumir('teste:a', op));
    assert.deepEqual(res.map(x => [x.ok, x.n, x.restante]), [[true, 1, 2], [true, 2, 1], [true, 3, 0], [false, 4, 0]]);
    assert.equal(res[3].retryAfterSeg, 60);
    r.avancar(30000);
    assert.equal((await c.consumir('teste:a', op)).retryAfterSeg, 30);
    r.avancar(31000);
    const novo = await c.consumir('teste:a', op);
    assert.deepEqual([novo.ok, novo.n], [true, 1]);
    assert.equal(banco.documentos('limites').length, 1);
    assert.deepEqual(await c.ler('teste:a'), { n: 1, bloqueadoAte: null, expiraEm: new Date(r().getTime() + 60000) });
  });

  test('corrida: 20 consumos simultâneos contam 20 (atômico, um documento)', async () => {
    const banco = novoBanco();
    let soltar;
    banco.portao = new Promise(x => { soltar = x; });
    const c = criarContadorPersistente({ repo: repoDe(banco) });
    const p = Promise.all(Array.from({ length: 20 }, () => c.consumir('teste:corrida', { janelaMs: 60000, max: 100 })));
    soltar();
    const res = await p;
    assert.deepEqual(res.map(x => x.n).sort((a, b) => a - b), Array.from({ length: 20 }, (_, i) => i + 1));
    assert.equal(banco.documentos('limites').length, 1);
  });

  test('bloquear / ler / zerar; e-mail em claro na chave é recusado', async () => {
    const banco = novoBanco();
    const r = relogio();
    const c = criarContadorPersistente({ repo: repoDe(banco), agora: r });
    await c.bloquear('2fa:u1', 3600000);
    const l = await c.ler('2fa:u1');
    assert.equal(l.bloqueadoAte.getTime(), r().getTime() + 3600000);
    const x = await c.consumir('2fa:u1', { janelaMs: 60000, max: 10 });
    assert.equal(x.ok, false, 'bloqueado mesmo abaixo do máximo');
    assert.ok(x.retryAfterSeg >= 3599);
    await c.zerar('2fa:u1');
    assert.deepEqual(await c.ler('2fa:u1'), { n: 0, bloqueadoAte: null, expiraEm: null });
    await assert.rejects(c.consumir('login:ana@exemplo.invalid', { janelaMs: 1, max: 1 }), TypeError);
  });

  test('limitePersistente: 429 com Retry-After e codigo; chaveUsuario', async () => {
    const banco = await bancoSemeado();
    const contador = criarContadorPersistente({ repo: repoDe(banco) });
    const app = express();
    app.use(async (req, _res, next) => { req.user = await usuario(banco, 'u-aluno1'); next(); });
    app.get('/x', limitePersistente(contador, { janelaMs: 60000, max: 2, chave: req => `exportacao:${chaveUsuario(req)}` }), (_q, res) => res.json({ ok: true }));
    app.use(criarTratadorErroPortal({ log: silencioso }));
    const { server, base } = await subir(app);
    try {
      const api = cliente(base);
      assert.equal((await api.get('/x')).status, 200);
      assert.equal((await api.get('/x')).status, 200);
      const r = await api.get('/x');
      assert.equal(r.status, 429);
      assert.equal(r.corpo.codigo, 'limite');
      assert.ok(Number(r.headers.get('retry-after')) > 0);
      assert.equal(chaveUsuario({ user: { _id: oid('u-aluno1') } }), `u:${IDS['u-aluno1']}`);
    } finally { await fechar(server); }
  });

  test('conferirSenhaAtual: certa → true; errada → false (5×); 6ª → 429, sessões derrubadas, auditoria e e-mail; depois bloqueia sem bcrypt', async () => {
    const banco = await bancoSemeado();
    const repo = repoDe(banco);
    const contador = criarContadorPersistente({ repo });
    const auditoria = criarAuditoria({ repo, log: silencioso });
    const f = fetchFalso([{ status: 200, json: { id: 'm' } }]);
    const email = criarEnviadorEmail({ resendApiKey: 'k', de: 'QA <qa@exemplo.invalid>', fetchImpl: f, log: silencioso, hmac: v => `h-${v.length}` });
    let comparacoes = 0;
    const checkSenha = async (s) => { comparacoes++; return s === 'certa-123'; };
    const req = await reqDe(banco, 'u-aluno1');
    req.user.senhaHash = 'hash-qualquer';
    const deps = { contador, auditoria, email, repo, checkSenha, log: silencioso };

    assert.equal(await conferirSenhaAtual(req, 'certa-123', deps), true);
    for (let i = 0; i < 5; i++) assert.equal(await conferirSenhaAtual(req, 'errada', deps), false);
    const antes = (await usuario(banco, 'u-aluno1')).sessaoVersao || 0;
    await assert.rejects(conferirSenhaAtual(req, 'errada', deps), e => e.status === 429 && e.codigo === 'muitas-tentativas' && e.retryAfterSeg > 0);
    assert.equal((await usuario(banco, 'u-aluno1')).sessaoVersao, antes + 1, 'sessões derrubadas');
    assert.ok(banco.documentos('auditoria').some(d => d.acao === 'auth.senha_errada_logado' && d.alvoUserId === IDS['u-aluno1']));
    await new Promise(r => setTimeout(r, 10));
    assert.equal(f.chamadas.length, 1);
    assert.match(f.chamadas[0].corpo.subject, /Sessão encerrada/);
    const n = comparacoes;
    await assert.rejects(conferirSenhaAtual(req, 'certa-123', deps), e => e.status === 429);
    assert.equal(comparacoes, n, 'bloqueado: nenhum bcrypt');
    assert.equal((await usuario(banco, 'u-aluno1')).sessaoVersao, antes + 1, 'só uma vez');
    await assert.rejects(conferirSenhaAtual(req, { $gt: '' }, deps), e => e.status === 400 && e.codigo === 'formato-invalido');
    const contadorLimites = banco.documentos('limites');
    assert.ok(contadorLimites.every(d => !/@/.test(d.chave)));
  });

  test('conferirSenhaAtual: limite diário (10 em 24 h) mesmo com janelas curtas vencidas', async () => {
    const banco = await bancoSemeado();
    const r = relogio('2026-10-18T08:00:00Z');
    const repo = repoDe(banco);
    const contador = criarContadorPersistente({ repo, agora: r });
    const req = await reqDe(banco, 'u-aluno2');
    req.user.senhaHash = 'h';
    const deps = { contador, repo, checkSenha: async () => false, agora: r, log: silencioso };
    for (let i = 0; i < 10; i++) {
      assert.equal(await conferirSenhaAtual(req, 'errada', deps), false, `tentativa ${i + 1}`);
      if (i % 4 === 3) r.avancar(16 * 60 * 1000); // janela de 15 min vence; a diária não
    }
    await assert.rejects(conferirSenhaAtual(req, 'errada', deps), e => e.status === 429);
  });
});

// =============================================================
describe('email.js', () => {
  test('sem chave ou remetente: indisponível e não chama o provedor', async () => {
    const f = fetchFalso();
    const e = criarEnviadorEmail({ resendApiKey: null, de: 'x', fetchImpl: f, log: silencioso });
    assert.equal(e.disponivel, false);
    assert.deepEqual(await e.enviar({ para: 'a@exemplo.invalid', assunto: 'x', texto: 'y' }), { enviado: false, motivo: 'nao-configurado' });
    assert.equal(criarEnviadorEmail({ resendApiKey: 'k', de: null }).disponivel, false);
    assert.equal(f.chamadas.length, 0);
  });

  test('enviar: POST <url>/emails, Bearer, sem reply_to, assunto numa linha; falha do provedor não lança e o log não tem o e-mail', async () => {
    const f = fetchFalso([{ status: 200, json: { id: '1' } }, { status: 500, json: {} }, { erro: new Error('rede caiu') }]);
    const log = criarLogEspiao();
    const e = criarEnviadorEmail({ resendApiKey: 'chave-qa', de: 'Plataforma QA <qa@exemplo.invalid>', url: 'http://127.0.0.1:9/', fetchImpl: f, log, hmac: () => 'abcdef0123456789' });
    assert.deepEqual(await e.enviar({ para: 'Aluna@Exemplo.invalid', assunto: 'Linha 1\nLinha 2', texto: 'Corpo' }), { enviado: true });
    const c = f.chamadas[0];
    assert.equal(c.url, 'http://127.0.0.1:9/emails');
    assert.equal(c.metodo, 'POST');
    assert.equal(c.headers.authorization, 'Bearer chave-qa');
    assert.deepEqual(c.corpo, { from: 'Plataforma QA <qa@exemplo.invalid>', to: ['aluna@exemplo.invalid'], subject: 'Linha 1 Linha 2', text: 'Corpo' });
    assert.deepEqual(await e.enviar({ para: 'aluna@exemplo.invalid', assunto: 'x', texto: 'y' }), { enviado: false, motivo: 'falha-provedor' });
    assert.deepEqual(await e.enviar({ para: 'aluna@exemplo.invalid', assunto: 'x', texto: 'y' }), { enviado: false, motivo: 'falha-provedor' });
    assert.deepEqual(await e.enviar({ para: 'nao-e-email', assunto: 'x', texto: 'y' }), { enviado: false, motivo: 'destinatario-invalido' });
    assert.doesNotMatch(log.texto(), /aluna@|exemplo\.invalid|nao-e-email/);
    assert.match(log.texto(), /abcdef012345/);
  });

  test('timeout: provedor que nunca responde → falha-provedor; enviarEmSegundoPlano não espera e usa waitUntil na Vercel', async () => {
    const lento = criarEnviadorEmail({ resendApiKey: 'k', de: 'x <x@exemplo.invalid>', fetchImpl: fetchFalso('nunca'), timeoutMs: 50, log: silencioso, hmac: () => 'h' });
    const t0 = Date.now();
    assert.deepEqual(await lento.enviar({ para: 'a@exemplo.invalid', assunto: 'x', texto: 'y' }), { enviado: false, motivo: 'falha-provedor' });
    assert.ok(Date.now() - t0 < 1000);

    const simbolo = Symbol.for('@vercel/request-context');
    const promessas = [];
    globalThis[simbolo] = { get: () => ({ waitUntil: p => promessas.push(p) }) };
    try {
      const t1 = Date.now();
      const p = lento.enviarEmSegundoPlano({ para: 'a@exemplo.invalid', assunto: 'x', texto: 'y' });
      assert.ok(Date.now() - t1 < 20, 'retorna na hora');
      assert.equal(promessas.length, 1);
      assert.deepEqual(await p, { enviado: false, motivo: 'falha-provedor' });
    } finally { delete globalThis[simbolo]; }
  });

  test('MODELOS: os 12 da API §4.14, assunto ≤ 180 numa linha, aviso de segurança no fim, sem "undefined"', () => {
    const nomes = ['linkAcesso', 'redefinirSenha', 'confirmarNovoEmail', 'verificarEmail', 'avisoSenhaAlterada', 'avisoEmailAlterado',
      'aviso2faAlterado', 'avisoSenhaTemporaria', 'aviso2faBloqueado', 'avisoTentativasDeAcesso', 'avisoSenhaErradaLogado', 'contratoAssinado'];
    assert.deepEqual(Object.keys(MODELOS).sort(), [...nomes].sort());
    const link = 'https://complexodmc.com.br/plataforma-ead/acesso-link.html#acesso=' + 'a'.repeat(43);
    for (const n of nomes) {
      const m = MODELOS[n]({ nome: 'Ana Maria Souza', link, em: new Date('2026-10-18T15:00:00Z'), expiraEm: new Date('2026-10-21T15:00:00Z'), titulo: 'Contrato de prestação de serviços educacionais', codigo: 'CTR-AAAA-BBBB-CCCC', novoEmail: 'ana.nova@exemplo.invalid' });
      assert.ok(m.assunto.length > 0 && m.assunto.length <= 180 && !/[\r\n]/.test(m.assunto), n);
      assert.ok(m.texto.includes(RODAPE_SEGURANCA), `${n}: aviso de segurança`);
      assert.ok(m.texto.startsWith('Olá, Ana.'), n);
      assert.doesNotMatch(m.texto + m.assunto, /undefined|null|NaN|MEC|pós-gradua/i, n);
    }
    assert.match(MODELOS.avisoSenhaAlterada({ nome: 'Ana', em: new Date('2026-10-18T15:00:00Z') }).texto, /18\/10\/2026 às 12:00/);
    assert.doesNotMatch(MODELOS.avisoEmailAlterado({ novoEmail: 'ana.nova@exemplo.invalid' }).texto, /ana\.nova@/);
    assert.equal(mascararEmail('ana.nova@exemplo.invalid'), 'an***@exemplo.invalid');
    assert.throws(() => MODELOS.linkAcesso({ nome: 'Ana' }), TypeError, 'link obrigatório');
  });

  test('montarLinkDeAcesso: só com PORTAL_BASE_URL, token só no fragmento', () => {
    const t = 'A'.repeat(43);
    assert.equal(montarLinkDeAcesso({ baseUrl: 'https://complexodmc.com.br/', tipo: 'redefinir', token: t }), `https://complexodmc.com.br/plataforma-ead/acesso-link.html#redefinir=${t}`);
    assert.equal(montarLinkDeAcesso({ baseUrl: null, tipo: 'acesso', token: t }), null);
    assert.throws(() => montarLinkDeAcesso({ baseUrl: 'https://x', tipo: 'outro', token: t }), TypeError);
    assert.throws(() => montarLinkDeAcesso({ baseUrl: 'https://x', tipo: 'acesso', token: 'curto' }), TypeError);
  });
});

// =============================================================
describe('acesso.js (contexto e equipe.*) sobre as fixtures', () => {
  test('contexto: uma ida ao banco por requisição (memo em req._portalAcesso)', async () => {
    const banco = await bancoSemeado();
    const acesso = criarAcesso({ repo: repoDe(banco) });
    const req = await reqDe(banco, 'u-prof');
    const antes = banco.contagem('find', 'liberacoes');
    await Promise.all([acesso.podeVerCurso(req, 'curso-01'), acesso.podeGerirConteudo(req, 'curso-01'), acesso.turmasVisiveis(req, 'curso-01')]);
    await acesso.podeVerCurso(req, 'curso-02');
    assert.equal(banco.contagem('find', 'liberacoes') - antes, 1);
    const ctx = await acesso.contexto(req);
    assert.equal(ctx.papel, 'professor');
    assert.ok(ctx.cursosDocenteGeral.has('curso-01'));
  });

  test('podeVerCurso / podeGerirConteudo / podeGerirTurma / turmasVisiveis', async () => {
    const banco = await bancoSemeado();
    const a = criarAcesso({ repo: repoDe(banco) });
    const r = n => reqDe(banco, n);
    assert.equal(await a.podeVerCurso(await r('u-aluno1'), 'curso-01'), true);
    assert.equal(await a.podeVerCurso(await r('u-aluno1'), 'curso-02'), false);
    assert.equal(await a.podeVerCurso(await r('u-intruso'), 'curso-01'), false);
    assert.equal(await a.podeVerCurso(await r('u-prof'), 'curso-01'), true, 'docente sem liberação');
    assert.equal(await a.podeVerCurso(await r('u-ex'), 'curso-01'), false, 'rebaixado perde a docência');
    assert.equal(await a.podeVerCurso(await r('u-admin'), 'curso-02'), true);
    assert.equal(await a.podeVerCurso({}, 'curso-01'), false, 'anônimo');

    assert.equal(await a.podeGerirConteudo(await r('u-prof'), 'curso-01'), true);
    assert.equal(await a.podeGerirConteudo(await r('u-prof-t1'), 'curso-01'), false);
    assert.equal(await a.podeGerirTurma(await r('u-prof-t1'), 'curso-01', IDS.T1), true);
    assert.equal(await a.podeGerirTurma(await r('u-prof-t1'), 'curso-01', oid('T1')), true, 'aceita ObjectId');
    assert.equal(await a.podeGerirTurma(await r('u-prof-t1'), 'curso-01', IDS.T2), false);
    assert.equal(await a.podeGerirTurma(await r('u-prof-t1'), 'curso-01', null), false);
    assert.equal(await a.podeGerirTurma(await r('u-prof'), 'curso-01', IDS.T2), true);

    assert.equal(await a.turmasVisiveis(await r('u-admin'), 'curso-01'), null);
    assert.equal(await a.turmasVisiveis(await r('u-prof'), 'curso-01'), null);
    assert.deepEqual(await a.turmasVisiveis(await r('u-prof-t1'), 'curso-01'), [IDS.T1]);
    assert.deepEqual(await a.turmasVisiveis(await r('u-aluno1'), 'curso-01'), []);
  });

  test('podeVerMatricula e podeVerAluno: docente só de turma não vê outra turma nem liberação sem matrícula', async () => {
    const banco = await bancoSemeado();
    const a = criarAcesso({ repo: repoDe(banco) });
    const r = n => reqDe(banco, n);
    const [m1, m2] = banco.documentos('matriculas');
    assert.equal(await a.podeVerMatricula(await r('u-aluno1'), m1), true, 'dono');
    assert.equal(await a.podeVerMatricula(await r('u-aluno1'), m2), false);
    assert.equal(await a.podeVerMatricula(await r('u-prof-t1'), m1), true);
    assert.equal(await a.podeVerMatricula(await r('u-prof-t1'), m2), false);
    assert.equal(await a.podeVerMatricula(await r('u-prof'), m2), true);

    assert.equal(await a.podeVerAluno(await r('u-prof'), IDS['u-aluno2']), true);
    assert.equal(await a.podeVerAluno(await r('u-prof-t1'), IDS['u-aluno1']), true);
    assert.equal(await a.podeVerAluno(await r('u-prof-t1'), IDS['u-aluno2']), false);
    assert.equal(await a.podeVerAluno(await r('u-prof'), IDS['u-intruso']), false);
    await banco.collection('liberacoes').insertOne({ userId: IDS['u-intruso'], cursoId: 'curso-01', grantedAt: new Date() });
    assert.equal(await a.podeVerAluno(await r('u-prof'), IDS['u-intruso']), true, 'docência geral vê liberação sem matrícula');
    assert.equal(await a.podeVerAluno(await r('u-prof-t1'), IDS['u-intruso']), false, 'docência de turma não vê');
    await banco.collection('matriculas').updateOne({ _id: oid('mat-aluno1') }, { $set: { status: 'cancelada' } });
    assert.equal(await a.podeVerAluno(await r('u-prof-t1'), IDS['u-aluno1']), false, 'cancelada não conta');
    assert.equal(await a.podeVerAluno(await r('u-admin'), IDS['u-intruso']), true);
    assert.equal(await a.podeVerAluno(await r('u-ex'), IDS['u-aluno1']), false);
  });

  test('cursosDoAluno, temVinculo, contextoDaAula e contextoDoModulo', async () => {
    const banco = await bancoSemeado();
    const a = criarAcesso({ repo: repoDe(banco) });
    assert.deepEqual(await a.cursosDoAluno(IDS['u-aluno1']), ['curso-01']);
    assert.deepEqual(await a.cursosDoAluno(IDS['u-intruso']), []);
    assert.equal(await a.temVinculo(IDS['u-aluno2']), true);
    assert.equal(await a.temVinculo(IDS['u-intruso']), false);
    const c = await a.contextoDaAula('c01-m02-a01');
    assert.equal(c.cursoId, 'curso-01');
    assert.equal(c.modulo._id, 'c01-m02');
    assert.equal(await a.contextoDaAula('nao-existe'), null);
    assert.equal(await a.contextoDaAula('../x'), null);
    const m = await a.contextoDoModulo('c02-m01');
    assert.equal(m.curso._id, 'curso-02');
  });

  test('equipe.*: docências só valem com papel professor/admin e conta ativa', async () => {
    const banco = await bancoSemeado();
    const { equipe } = criarAcesso({ repo: repoDe(banco) });
    assert.deepEqual(await equipe.cursosDoProfessor(IDS['u-prof']), ['curso-01']);
    assert.deepEqual(await equipe.cursosDoProfessor(IDS['u-ex']), [], 'rebaixado');
    assert.deepEqual(await equipe.cursosDoProfessor(IDS['u-aluno1']), []);
    assert.deepEqual(await equipe.docencias(IDS['u-prof-t1']), [{ cursoId: 'curso-01', turmaId: IDS.T1 }]);
    assert.deepEqual(await equipe.professoresDoCurso('curso-01', null), [IDS['u-prof']]);
    assert.deepEqual((await equipe.professoresDoCurso('curso-01', IDS.T1)).sort(), [IDS['u-prof'], IDS['u-prof-t1']].sort());
    assert.deepEqual(await equipe.professoresDoCurso('curso-01', IDS.T2), [IDS['u-prof']]);
    await banco.collection('users').updateOne({ _id: oid('u-prof') }, { $set: { desativadoEm: new Date() } });
    assert.deepEqual(await equipe.professoresDoCurso('curso-01', null), [], 'desativado sai');
    assert.deepEqual(await equipe.cursosDoProfessor(IDS['u-prof']), []);
  });
});

// =============================================================
describe('perfis-leitura.js', () => {
  test('perfis.publicos: nome de exibição, nome social, e-mail e foto; nunca CPF; ids inválidos ignorados', async () => {
    const banco = await bancoSemeado();
    const p = criarPerfisLeitura({ repo: repoDe(banco) });
    await banco.collection('perfis').insertOne({ userId: IDS['u-aluno1'], nomeRegistro: 'Aluna Um de Teste', nomeSocial: 'Alu', cpf: gerarCpfValido('a1') });
    await banco.collection('users').updateOne({ _id: oid('u-aluno1') }, { $set: { temFoto: true } });
    const mapa = await p.publicos([IDS['u-aluno1'], IDS['u-aluno2'], 'invalido', null, IDS['u-aluno1']]);
    assert.deepEqual([...mapa.keys()].sort(), [IDS['u-aluno1'], IDS['u-aluno2']].sort());
    assert.deepEqual(mapa.get(IDS['u-aluno1']), {
      id: IDS['u-aluno1'], nome: 'Aluna Um de Teste', nomeSocial: 'Alu', email: 'aluno1@exemplo.invalid',
      fotoUrl: `/api/portal/professor/alunos/${IDS['u-aluno1']}/foto`
    });
    assert.deepEqual(mapa.get(IDS['u-aluno2']), { id: IDS['u-aluno2'], nome: 'Aluno Dois de Teste', nomeSocial: null, email: 'aluno2@exemplo.invalid', fotoUrl: null });
    const json = JSON.stringify([...mapa.values()]);
    assert.doesNotMatch(json, /cpf|nomeRegistro|endereco|rg/i);
    assert.ok(!json.includes(gerarCpfValido('a1')));
    assert.equal((await p.publicos([])).size, 0);
  });

  test('perfis.identificacao: sem perfil, Brasil completo e exterior com passaporte', async () => {
    const banco = await bancoSemeado();
    const p = criarPerfisLeitura({ repo: repoDe(banco) });
    const sem = await p.identificacao(IDS['u-aluno2']);
    assert.equal(sem.nomeRegistro, null);
    assert.equal(sem.documento, null);
    assert.equal(sem.completo, false);
    assert.ok(sem.faltando.includes('nomeRegistro') && sem.faltando.includes('cpf'));
    assert.equal(sem.email, 'aluno2@exemplo.invalid');

    const cpf = gerarCpfValido('identificacao');
    await banco.collection('perfis').insertOne({
      userId: IDS['u-aluno1'], nomeRegistro: 'Aluna Um de Teste', cpf, nascimento: '1990-05-10', nacionalidade: 'Brasileira', celular: '+5511987654321',
      endereco: { pais: 'Brasil', cep: '01310100', logradouro: 'Avenida Paulista', numero: '1000', bairro: 'Bela Vista', cidade: 'São Paulo', uf: 'SP' }
    });
    const br = await p.identificacao(IDS['u-aluno1']);
    assert.deepEqual(br, { nomeRegistro: 'Aluna Um de Teste', documento: { tipo: 'cpf', numero: cpf }, email: 'aluno1@exemplo.invalid', completo: true, faltando: [] });

    await banco.collection('perfis').insertOne({
      userId: IDS['u-intruso'], nomeRegistro: 'Pessoa do Exterior', cpf: null, passaporte: { numero: 'AB123456', paisEmissor: 'Portugal' },
      nascimento: '1985-01-01', nacionalidade: 'Portuguesa', celular: '+351912345678',
      endereco: { pais: 'Portugal', codigoPostal: '1000-001', logradouro: 'Rua Augusta', cidade: 'Lisboa', regiao: 'Lisboa' }
    });
    const ext = await p.identificacao(IDS['u-intruso']);
    assert.deepEqual(ext.documento, { tipo: 'passaporte', numero: 'AB123456' });
    assert.equal(ext.completo, true);
    assert.equal(await p.identificacao(new ObjectId().toHexString()), null, 'conta inexistente');
  });

  test('calcularCompletude: pct e faltando por país', () => {
    const vazio = calcularCompletude(null, { email: null });
    assert.equal(vazio.completo, false);
    assert.equal(vazio.pct, 0);
    const parcial = calcularCompletude({ nomeRegistro: 'X', nacionalidade: 'Brasileira' }, { email: 'x@exemplo.invalid' });
    assert.ok(parcial.pct > 0 && parcial.pct < 100);
    assert.ok(parcial.faltando.includes('endereco.cep'));
  });
});

// =============================================================
describe('servicos.js — localizador, lote e executores dos grupos', () => {
  test('registrar/obter/tentar; duplicado lança servico-duplicado; ausente → ServicoIndisponivel 503', () => {
    const s = criarServicos();
    s.registrar('teste.um', () => 1);
    assert.throws(() => s.registrar('teste.um', () => 2), e => e.codigo === 'servico-duplicado');
    assert.throws(() => s.registrar('Nome Ruim', () => 1), TypeError);
    assert.throws(() => s.obter('teste.dois'), e => e instanceof ServicoIndisponivel && e.codigo === 'servico-indisponivel' && e.status === 503 && e.nome === 'teste.dois');
    assert.equal(s.tentar('teste.dois'), null);
    assert.equal(s.obter('teste.um')(), 1);
    assert.deepEqual(s.nomes(), ['teste.um']);
  });

  test('grupos: nome e forma conferidos; todos() devolve cópia', () => {
    const s = criarServicos();
    assert.throws(() => s.adicionar('grupoInventado', {}), TypeError);
    assert.throws(() => s.adicionar('busca', { tipo: 'cursos', papeis: ['aluno'] }), TypeError, 'sem buscar()');
    assert.throws(() => s.adicionar('painel', { bloco: 'inventado', chaves: ['x'], contar: async () => ({}) }), TypeError);
    assert.throws(() => s.adicionar('aoConcluirAula', {}), TypeError);
    s.adicionar('aoConcluirAula', async () => {});
    const lista = s.todos('aoConcluirAula');
    lista.push('lixo');
    assert.equal(s.todos('aoConcluirAula').length, 1);
    assert.equal(GRUPOS.length, 9);
  });

  test('lote: grava só no confirmar; duplicado contra o base é conferido ANTES de gravar qualquer nome', () => {
    const base = criarServicos();
    base.registrar('teste.existente', () => 0);
    const lote = criarLoteDeServicos(base);
    lote.registrar('teste.novo', () => 1);
    lote.adicionar('validador', { prefixo: 'TST', validar: async () => null });
    assert.equal(base.tentar('teste.novo'), null);
    assert.equal(lote.obter('teste.novo')(), 1);
    assert.equal(lote.todos('validador').length, 1);
    assert.equal(base.todos('validador').length, 0);
    lote.confirmar();
    assert.equal(base.obter('teste.novo')(), 1);
    assert.equal(base.todos('validador').length, 1);
    assert.throws(() => lote.registrar('teste.outro', () => 1), /confirmado/);

    const lote2 = criarLoteDeServicos(base);
    assert.throws(() => lote2.registrar('teste.existente', () => 9), e => e.codigo === 'servico-duplicado');
    // corrida: outro módulo grava no base depois do registrar do lote e antes do confirmar
    const lote4 = criarLoteDeServicos(base);
    lote4.registrar('teste.a4', () => 4);
    lote4.registrar('teste.b4', () => 4);
    base.registrar('teste.b4', () => 'corrida');
    assert.throws(() => lote4.confirmar(), e => e.codigo === 'servico-duplicado');
    assert.equal(base.tentar('teste.a4'), null, 'nada do lote foi gravado');
  });

  test('executarAvisos: contadores pelos ids fixos (null sem definição; 0/false com definição sem aviso); obrigatórios primeiro', async () => {
    const s = criarServicos();
    s.adicionar('aviso', { id: 'perfil-incompleto', gerar: async () => [{ tom: 'aviso', texto: 'Complete o seu cadastro.', href: 'perfil.html#identificacao', rotulo: 'Completar', dispensavel: true }] });
    s.adicionar('aviso', { id: 'contrato-pendente', gerar: async () => [{ tom: 'erro', texto: 'Há 2 contratos para assinar.', href: 'contratos.html', rotulo: 'Ver', dispensavel: false, contador: 2 }] });
    s.adicionar('aviso', { id: 'troca-de-senha', gerar: async () => [] });
    s.adicionar('aviso', { id: 'lancamento-atraso', gerar: async () => { throw new Error('F5 fora'); } });
    s.adicionar('aviso', { id: 'avaliacao-disponivel', gerar: async () => [{ texto: 'Nova avaliação.', href: 'javascript:alert(1)' }] });
    const { avisos, contadores } = await executarAvisos(s, { user: { _id: 'x' } }, { log: silencioso });
    assert.equal(avisos[0].id, 'contrato-pendente');
    assert.equal(avisos[0].dispensavel, false);
    assert.equal(avisos.find(a => a.id === 'avaliacao-disponivel').href, null, 'href fora do padrão interno vira null');
    assert.deepEqual(contadores, {
      contratosPendentes: 2, documentosPendentes: null, documentosNaoEnviados: null, lancamentosAtrasados: null,
      perfilIncompleto: true, precisaTrocarSenha: false, emailNaoVerificado: null, segundoFatorObrigatorio: null
    });
  });

  test('executarBusca: grupos por papel, provedor que falha omitido, href inválido descartado, paginação só com 1 tipo', async () => {
    const s = criarServicos();
    const chamadas = [];
    s.adicionar('busca', { tipo: 'cursos', papeis: ['aluno', 'professor', 'admin'], buscar: async (_r, _t, o) => { chamadas.push(o); return { itens: [{ id: 'c1', titulo: 'Curso', href: 'dashboard.html?curso=c1', bloqueado: true }, { id: 'c2', titulo: 'Mau', href: 'https://evil.example' }], temMais: true }; } });
    s.adicionar('busca', { tipo: 'documentos', papeis: ['aluno', 'admin'], buscar: async () => { throw new Error('F4b fora'); } });
    s.adicionar('busca', { tipo: 'atendimentos', papeis: ['admin'], buscar: async () => ({ itens: [], temMais: false }) });
    const g = await executarBusca(s, { user: { _id: 'x', papel: 'aluno' } }, [/curso/i], { log: silencioso });
    assert.deepEqual(Object.keys(g), ['cursos']);
    assert.deepEqual(g.cursos, { itens: [{ tipo: 'cursos', id: 'c1', titulo: 'Curso', contexto: null, href: 'dashboard.html?curso=c1', bloqueado: true }], temMais: true });
    await executarBusca(s, { user: { _id: 'x', papel: 'aluno' } }, [/x/], { tipos: ['cursos'], limite: 5, pagina: 3, log: silencioso });
    assert.deepEqual(chamadas.at(-1), { limite: 5, pular: 10 });
    const adm = await executarBusca(s, { user: { _id: 'x', isAdmin: true } }, [/x/], { log: silencioso });
    assert.deepEqual(Object.keys(adm).sort(), ['atendimentos', 'cursos']);
  });

  test('montarPainel: contribuição que falha → chaves dela null; validador, exportador, relatório, aoConcluirAula e cascata', async () => {
    const s = criarServicos();
    s.adicionar('painel', { bloco: 'alunos', chaves: ['comAcesso'], papeis: ['admin'], contar: async () => ({ comAcesso: 7, intrusa: 1 }) });
    s.adicionar('painel', { bloco: 'alunos', chaves: ['comMatriculaAtiva'], papeis: ['admin'], contar: async () => { throw new Error('x'); } });
    const p = await montarPainel(s, { user: { _id: 'a', isAdmin: true } }, { cursoIds: null }, { log: silencioso });
    assert.deepEqual(p.alunos, { comAcesso: 7, comMatriculaAtiva: null, liberacoesSemMatricula: null });
    assert.equal(p.documentos, null);

    s.adicionar('validador', { prefixo: 'DEC', validar: async () => ({ valido: true }) });
    assert.equal(validadorDoCodigo(s, 'dec-aaaa-bbbb-cccc')?.prefixo, 'DEC');
    assert.equal(validadorDoCodigo(s, 'XYZ-1'), null);
    assert.equal(validadorDoCodigo(s, 42), null);

    s.adicionar('exportador', { dominio: 'progresso', exportar: async u => ({ u }) });
    s.adicionar('exportador', { dominio: 'financeiro', exportar: async () => { throw new Error('F5'); } });
    assert.deepEqual(await exportarDoTitular(s, 'u1', { log: silencioso }), { secoes: { progresso: { u: 'u1' } }, indisponiveis: ['financeiro'] });

    s.adicionar('relatorio', { id: 'notas', titulo: 'Notas', papeis: ['professor', 'admin'], filtros: [], colunas: [], consultar: async () => [] });
    assert.equal(relatoriosDoPapel(s, 'aluno').length, 0);
    assert.equal(relatorioPorId(s, 'notas').titulo, 'Notas');

    let n = 0;
    s.adicionar('aoConcluirAula', async () => { n++; });
    s.adicionar('aoConcluirAula', async () => { throw new Error('F3a'); });
    assert.deepEqual(await dispararAoConcluirAula(s, { userId: 'u1' }, { log: silencioso }), { ouvintes: 2, falhas: 1 });
    assert.equal(n, 1);

    s.adicionar('cascata', { dominio: 'academico', bloqueios: async () => 2, apagar: async () => {} });
    s.adicionar('cascata', { dominio: 'avaliacoes', bloqueios: async () => { throw new Error('F2'); }, apagar: async () => { throw new Error('F2'); } });
    assert.deepEqual(await bloqueiosEmCascata(s, { tipo: 'aula', id: 'a1' }, { log: silencioso }), { total: 2, porDominio: { academico: 2 }, falhas: ['avaliacoes'] });
    assert.deepEqual(await apagarEmCascata(s, { tipo: 'aula', id: 'a1' }, { log: silencioso }), { falhas: ['avaliacoes'] });
  });
});

// =============================================================
describe('scripts/seed-portal-qa.js — só banco _qa em 127.0.0.1', () => {
  test('conferirAlvoQa: recusa banco sem _qa, complexodmc_local, +srv, host remoto e URI ausente', () => {
    const ok = conferirAlvoQa({ uri: 'mongodb://127.0.0.1:27017', db: 'complexodmc_portal_f0m_qa' });
    assert.deepEqual(ok, { ok: true, uri: 'mongodb://127.0.0.1:27017', db: 'complexodmc_portal_f0m_qa' });
    assert.equal(conferirAlvoQa({ uri: 'mongodb://usuario:senha@127.0.0.1:27017/?authSource=admin', db: 'x_qa' }).ok, true);
    for (const [uri, db] of [
      ['mongodb://127.0.0.1:27017', 'complexodmc_local'],
      ['mongodb://127.0.0.1:27017', 'complexodmc'],
      ['mongodb://127.0.0.1:27017', ''],
      ['mongodb://127.0.0.1:27017', undefined],
      ['mongodb://127.0.0.1:27017', 'qa'],
      ['mongodb://127.0.0.1:27017', 'banco_qa;drop'],
      ['mongodb+srv://cluster.example.mongodb.net', 'complexodmc_portal_qa'],
      ['mongodb://localhost:27017', 'complexodmc_portal_qa'],
      ['mongodb://10.0.0.5:27017', 'complexodmc_portal_qa'],
      ['mongodb://127.0.0.1:27017,10.0.0.6:27017', 'complexodmc_portal_qa'],
      ['mongodb://127.0.0.1.evil.example:27017', 'complexodmc_portal_qa'],
      ['', 'complexodmc_portal_qa'],
      [undefined, 'complexodmc_portal_qa']
    ]) {
      assert.equal(conferirAlvoQa({ uri, db }).ok, false, `${uri} · ${db}`);
    }
  });

  test('o script recusa ANTES de conectar (código 2), sem tocar no banco', () => {
    const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/seed-portal-qa.js');
    const rodar = env => spawnSync(process.execPath, [script, '--aplicar'], {
      cwd: os.tmpdir(), encoding: 'utf8', timeout: 15000,
      env: { PATH: process.env.PATH, DOTENV_CONFIG_QUIET: 'true', JWT_SECRET: 'x', ...env }
    });
    const local = rodar({ MONGODB_URI: 'mongodb://127.0.0.1:9', MONGODB_DB: 'complexodmc_local' });
    assert.equal(local.status, 2);
    assert.match(local.stderr, /recusado: só bancos de QA/);
    const remoto = rodar({ MONGODB_URI: 'mongodb+srv://cluster.example.mongodb.net', MONGODB_DB: 'complexodmc_portal_qa' });
    assert.equal(remoto.status, 2);
    assert.match(remoto.stderr, /127\.0\.0\.1/);
    const semBanco = rodar({ MONGODB_URI: 'mongodb://127.0.0.1:9' });
    assert.equal(semBanco.status, 2);
    assert.match(semBanco.stderr, /MONGODB_DB é obrigatório/);
  });

  test('contas de QA: e-mails fictícios (.invalid), papéis coerentes', () => {
    assert.ok(CONTAS_QA.every(c => /@exemplo\.invalid$/.test(c.email)));
    assert.deepEqual([...new Set(CONTAS_QA.map(c => c.papel))].sort(), ['admin', 'aluno', 'professor']);
  });
});
