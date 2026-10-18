// Portal · F2 — motor de avaliação (puro). PORTAL-API §8.11, §8.13.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  arredondarNota, embaralhar, conferirBanco, sortearQuestoes, prazoDe, prazoVencido, validarResposta, calcularTotais,
  corrigirNoEnvio, estadoDoAluno, situacaoDoModulo, tentativaParaAluno, resultadoParaAluno, gabaritoParaAluno, previaParaEquipe,
  avisosDe, camposDoSelo, tamanhoUnicode, NOTA_MINIMA_PADRAO
} from '../src/portal/avaliacoes/avaliacao-motor.js';
import { randomInt } from './apoio/falsos.js';

const objetiva = (n, correta = 'b') => ({ _id: `q-obj-${n}`, tipo: 'objetiva', enunciado: `Objetiva ${n}`, alternativas: [{ id: 'a', texto: 'A' }, { id: 'b', texto: 'B' }, { id: 'c', texto: 'C' }], corretaId: correta, explicacao: `Explicação ${n}`, pontos: 1, ativa: true });
const dissertativa = n => ({ _id: `q-dis-${n}`, tipo: 'dissertativa', enunciado: `Dissertativa ${n}`, orientacao: 'Seja objetivo.', limiteCaracteres: 200, respostaReferencia: 'REFERENCIA-SECRETA', explicacao: '', pontos: 2, ativa: true });
const AV = { tipo: 'modular', sorteio: { objetivas: 2, dissertativas: 1, arquivos: 0 }, tentativasMax: 2, tempoLimiteMin: 30, embaralharAlternativas: true, publicada: true };
const SEGREDOS = ['corretaId', 'explicacao', 'respostaReferencia', 'REFERENCIA-SECRETA'];

function semSegredos(obj, msg) {
  const json = JSON.stringify(obj);
  for (const s of SEGREDOS) assert.ok(!json.includes(s), `${msg}: vazou ${s}`);
}

describe('motor: nota, sorteio e tempo', () => {
  test('nota com 1 casa e arredondamento meio para cima', () => {
    assert.equal(arredondarNota(7.25), 7.3);
    assert.equal(arredondarNota(7.24), 7.2);
    assert.equal(arredondarNota(6.95), 7);
    assert.equal(arredondarNota((10 * 2) / 3), 6.7);
    assert.equal(arredondarNota(null), null);
  });

  test('embaralhar é Fisher–Yates determinístico com RNG injetado e não altera a entrada', () => {
    const lista = [1, 2, 3, 4, 5, 6];
    const a = embaralhar(lista, randomInt('x'));
    const b = embaralhar(lista, randomInt('x'));
    assert.deepEqual(a, b);
    assert.deepEqual([...a].sort(), lista);
    assert.deepEqual(lista, [1, 2, 3, 4, 5, 6]);
  });

  test('banco insuficiente bloqueia; menos de 2× o sorteio gera aviso não bloqueante', () => {
    assert.equal(conferirBanco({ objetivas: 3 }, { objetiva: 2 }).ok, false);
    const r = conferirBanco({ objetivas: 2 }, { objetiva: 3 });
    assert.equal(r.ok, true);
    assert.equal(r.avisos.length, 1);
    assert.equal(conferirBanco({ objetivas: 2 }, { objetiva: 4 }).avisos.length, 0);
    assert.equal(conferirBanco({ objetivas: 0 }, { objetiva: 4 }).ok, false, 'composição vazia');
  });

  test('sorteio pega N por tipo, snapshot completo, alternativas com ids estáveis', () => {
    const banco = [objetiva(1), objetiva(2), objetiva(3), dissertativa(1), dissertativa(2)];
    const s = sortearQuestoes(AV, banco, { randomInt: randomInt('s') });
    assert.equal(s.questoes.length, 3);
    assert.equal(s.questoes.filter(q => q.tipo === 'objetiva').length, 2);
    const d = s.questoes.find(q => q.tipo === 'dissertativa');
    assert.equal(d.limiteCaracteres, 200);
    assert.equal(d.respostaReferencia, 'REFERENCIA-SECRETA');
    for (const q of s.questoes.filter(x => x.tipo === 'objetiva')) {
      assert.deepEqual(q.alternativas.map(a => a.id).sort(), ['a', 'b', 'c']);
      assert.equal(q.corretaId, 'b');
    }
    assert.equal(sortearQuestoes({ ...AV, sorteio: { objetivas: 5 } }, banco).erro, 'banco-insuficiente');
  });

  test('prazo no servidor: tolerância de 30 s', () => {
    const ini = new Date('2026-10-18T12:00:00Z');
    const prazo = prazoDe(ini, 30);
    assert.equal(prazo.toISOString(), '2026-10-18T12:30:00.000Z');
    const t = { status: 'em_andamento', prazoEm: prazo };
    assert.equal(prazoVencido(t, new Date('2026-10-18T12:30:29Z')), false);
    assert.equal(prazoVencido(t, new Date('2026-10-18T12:30:31Z')), true);
    assert.equal(prazoDe(ini, null), null);
  });
});

describe('motor: respostas, correção e situação', () => {
  const tentativa = () => {
    const s = sortearQuestoes(AV, [objetiva(1), objetiva(2), dissertativa(1)], { randomInt: randomInt('t') });
    return { _id: 'tent-1', matriculaId: 'mat-1', avaliacaoId: 'av-1', userId: 'u1', numero: 1, status: 'em_andamento', iniciadaEm: new Date(), questoes: s.questoes, respostas: {}, correcao: {} };
  };

  test('validar resposta: alternativa inválida, texto longo (Unicode) e tipo arquivo', () => {
    const t = tentativa();
    const obj = t.questoes.find(q => q.tipo === 'objetiva');
    const dis = t.questoes.find(q => q.tipo === 'dissertativa');
    assert.equal(validarResposta(obj, { alternativaId: 'z' }).ok, false);
    assert.equal(validarResposta(obj, { alternativaId: 'a' }).ok, true);
    const longo = '😀'.repeat(201);
    assert.equal(tamanhoUnicode(longo), 201);
    const r = validarResposta(dis, { texto: longo });
    assert.equal(r.codigo, 'resposta-longa');
    assert.equal(r.extras.limite, 200);
    assert.equal(validarResposta(dis, { texto: '😀'.repeat(200) }).ok, true);
    assert.equal(validarResposta(undefined, {}).ok, false);
  });

  test('envio com dissertativa respondida → aguardando correção, nota null; em branco → 0 "Sem resposta" e corrigida', () => {
    const t = tentativa();
    for (const q of t.questoes) t.respostas[q.questaoId] = q.tipo === 'objetiva' ? { alternativaId: 'b' } : { texto: 'Minha resposta' };
    const r = corrigirNoEnvio(t, new Date());
    assert.equal(r.status, 'aguardando_correcao');
    assert.equal(r.totais.nota, null);
    assert.equal(r.totais.acertosObjetivas, 2);

    const t2 = tentativa();
    for (const q of t2.questoes) if (q.tipo === 'objetiva') t2.respostas[q.questaoId] = { alternativaId: 'b' };
    const r2 = corrigirNoEnvio(t2, new Date());
    assert.equal(r2.status, 'corrigida');
    assert.equal(Object.values(r2.correcaoAuto)[0].comentario, 'Sem resposta');
    assert.equal(r2.totais.nota, arredondarNota((10 * 2) / 4)); // 2 objetivas de 1 ponto + dissertativa de 2 com 0
    assert.equal(r2.totais.pctAcerto, 50);
  });

  test('nota com correção da dissertativa', () => {
    const t = tentativa();
    for (const q of t.questoes) t.respostas[q.questaoId] = q.tipo === 'objetiva' ? { alternativaId: 'b' } : { texto: 'x' };
    const dis = t.questoes.find(q => q.tipo === 'dissertativa');
    t.correcao[dis.questaoId] = { pontos: 1.5 };
    const tot = calcularTotais(t);
    assert.equal(tot.completa, true);
    assert.equal(tot.nota, arredondarNota(10 * 3.5 / 4));
  });

  test('situação do módulo pela melhor tentativa (CEO-4)', () => {
    assert.equal(situacaoDoModulo({ melhorNota: null, restantes: 1 }), 'cursando');
    assert.equal(situacaoDoModulo({ melhorNota: 7, notaMinima: 7 }), 'aprovado');
    assert.equal(situacaoDoModulo({ melhorNota: 6.9, notaMinima: 7, restantes: 1, finalizada: false }), 'em_recuperacao');
    assert.equal(situacaoDoModulo({ melhorNota: 6.9, notaMinima: 7, restantes: 1, finalizada: true }), 'reprovado');
    assert.equal(situacaoDoModulo({ melhorNota: 6.9, notaMinima: 7, restantes: 0, aguardandoCorrecao: true }), 'em_recuperacao');
    assert.equal(situacaoDoModulo({ melhorNota: 6.9, notaMinima: 7, restantes: 0 }), 'reprovado');
    assert.equal(NOTA_MINIMA_PADRAO, 7);
  });

  test('estado do aluno: melhor nota, restantes com extras, finalizar zera, simular', () => {
    const tents = [{ _id: 't1', status: 'corrigida', nota: 5 }, { _id: 't2', status: 'corrigida', nota: 6 }];
    const e = estadoDoAluno({ avaliacao: AV, tentativas: tents, registro: { tentativasExtras: 1 } });
    assert.equal(e.melhorNota, 6);
    assert.equal(e.permitidas, 3);
    assert.equal(e.restantes, 1);
    assert.equal(e.situacao, 'em_recuperacao');
    assert.equal(e.podeMelhorar, true);
    const fin = estadoDoAluno({ avaliacao: AV, tentativas: tents, registro: { finalizadaEm: new Date() } });
    assert.equal(fin.restantes, 0);
    assert.equal(fin.situacao, 'reprovado');
    assert.equal(fin.podeIniciar, false);
    const sim = estadoDoAluno({ avaliacao: AV, tentativas: [{ _id: 't1', status: 'aguardando_correcao', nota: null }], simular: { tentativaId: 't1', nota: 8 } });
    assert.equal(sim.melhorNota, 8);
    assert.equal(sim.situacao, 'aprovado');
    assert.equal(estadoDoAluno({ avaliacao: { ...AV, tipo: 'previa' }, tentativas: tents }).situacao, null, 'prévia não tem situação');
  });

  test('serializadores do aluno nunca levam gabarito antes da hora nem respostaReferencia', () => {
    const t = tentativa();
    semSegredos(tentativaParaAluno(t, new Date()), 'TentativaAluno');
    for (const q of t.questoes) t.respostas[q.questaoId] = q.tipo === 'objetiva' ? { alternativaId: 'b' } : { texto: 'x' };
    const env = { ...t, status: 'aguardando_correcao', correcao: { [t.questoes.find(q => q.tipo === 'dissertativa').questaoId]: { pontos: 2, comentario: 'rascunho', por: 'p' } } };
    const r = resultadoParaAluno(env);
    semSegredos(r, 'ResultadoAluno');
    assert.equal(r.nota, null);
    assert.deepEqual(r.comentarios, [], 'rascunho de correção não aparece');
    const parcial = gabaritoParaAluno({ ...env, status: 'corrigida' }, { completo: false });
    semSegredos(parcial, 'Gabarito parcial');
    const completo = gabaritoParaAluno({ ...env, status: 'corrigida' }, { completo: true });
    assert.ok(JSON.stringify(completo).includes('corretaId'));
    assert.ok(!JSON.stringify(completo).includes('REFERENCIA-SECRETA'), 'respostaReferencia nunca');
    const previa = previaParaEquipe(AV, [objetiva(1), objetiva(2), dissertativa(1)], { randomInt: randomInt('p') });
    semSegredos(previa, 'Prévia');
    assert.equal(previa.questoes.length, 3);
  });

  test('avisos e campos do selo', () => {
    const a = avisosDe(AV, { restantes: 2, permitidas: 2 });
    assert.equal(a.tentativas, '2 de 2 disponíveis');
    assert.equal(a.tempo, '30 minutos a partir do início');
    assert.match(a.questoes, /^3 questões/);
    assert.equal(avisosDe({ ...AV, tempoLimiteMin: null }).tempo, 'Livre');
    const c = camposDoSelo({ _id: 'x', codigo: 'AVL-1', avaliacaoId: 'a', matriculaId: 'm', userId: 'u', numero: 1, iniciadaEm: new Date(0), enviadaEm: new Date(1), pontosObtidos: 1, pontosPossiveis: 2, nota: 5, questoes: [{ questaoId: 'q', tipo: 'arquivo' }], respostas: { q: { arquivo: { sha256: 'abc' } } } });
    assert.deepEqual(c.arquivos, [{ questaoId: 'q', sha256: 'abc' }]);
  });
});
