// Portal · F3a — cálculo acadêmico (puro). PORTAL-API §8.3, §8.7, §8.11, DC-66 ·
// casos da linha `academico-calculo` (§9.3). Rode com `npm test` na raiz.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  horasDe, criteriosDe, calcularFrequencia, situacaoModulo, situacaoCurso, calcularElegibilidade,
  mediaParcial, statusDoEncontro, encontroVisivel, nivelRotulo, rotuloDaSituacao, NOTA_MINIMA_PADRAO, umaCasa
} from '../src/portal/academico/calculo-academico.js';

// lives.js importa db.js/config.js (exigem as variáveis abaixo; nenhuma conexão é aberta).
process.env.MONGODB_URI ||= 'mongodb://127.0.0.1:9/sem-conexao-nos-testes';
process.env.JWT_SECRET ||= 'segredo-apenas-para-testes';
process.env.DOTENV_CONFIG_QUIET = 'true';
const { statusDaLive } = await import('../src/routes/lives.js');

const AGORA = new Date('2026-10-18T12:00:00.000Z');
const h = n => new Date(AGORA.getTime() + n * 3600000);
const MAT = { _id: 'm1', cursoId: 'c1', turmaId: 'T1' };
const enc = (id, inicio, extra = {}) => ({ _id: id, cursoId: 'c1', turmaId: null, inicioEm: inicio, duracaoMin: 60, ...extra });
const aula = (id, moduloId = 'mod1') => ({ aulaId: id, moduloId });

describe('horasDe (§8.3)', () => {
  test('exemplos da especificação', () => {
    assert.equal(horasDe('42 horas'), 42);
    assert.equal(horasDe('360h'), 360);
    assert.equal(horasDe('3h 50min'), 3.8);
    assert.equal(horasDe('90min'), 1.5);
    assert.equal(horasDe(''), null);
    assert.equal(horasDe('—'), null);
    assert.equal(horasDe('abc'), null);
    assert.equal(horasDe(undefined), null);
    assert.equal(horasDe(12), 12);
  });
});

describe('criteriosDe', () => {
  test('padrões: nota mínima 7, demais sem efeito', () => {
    assert.deepEqual(criteriosDe({}), { notaMinima: 7, frequenciaMinima: null, cargaMinimaHoras: null, exigeTcc: false, frequenciaGravadaExigeVideo: false });
    assert.equal(criteriosDe(null).notaMinima, NOTA_MINIMA_PADRAO);
  });
  test('valores configurados e fora de faixa', () => {
    const c = criteriosDe({ criterios: { notaMinima: 6.5, frequenciaMinima: 75, cargaMinimaHoras: 360, exigeTcc: true } });
    assert.equal(c.notaMinima, 6.5);
    assert.equal(c.frequenciaMinima, 75);
    assert.equal(c.cargaMinimaHoras, 360);
    assert.equal(c.exigeTcc, true);
    assert.equal(criteriosDe({ criterios: { notaMinima: 11 } }).notaMinima, 7);
    assert.equal(criteriosDe({ criterios: { frequenciaMinima: -1 } }).frequenciaMinima, null);
  });
});

describe('calcularFrequencia (§8.7)', () => {
  test('só aulas: gravado/pendente; 0 contáveis → null', () => {
    const vazio = calcularFrequencia(MAT, AGORA, {});
    assert.equal(vazio.contaveis, 0);
    assert.equal(vazio.frequenciaPct, null);
    const f = calcularFrequencia(MAT, AGORA, {
      aulas: [aula('a1'), aula('a2'), aula('a3'), aula('a4')],
      frequencias: [{ origem: 'gravado', aulaId: 'a1', codigo: 'FRQ-1' }]
    });
    assert.equal(f.contaveis, 4);
    assert.equal(f.gravado, 1);
    assert.equal(f.pendentes, 3);
    assert.equal(f.frequenciaPct, 25);
    assert.equal(f.aoVivoPct, 0);
    assert.equal(f.gravadoPct, 25);
    assert.equal(f.porModulo.mod1.frequenciaPct, 25);
  });

  test('presença, compensação pela gravada, falta só depois do fim, em andamento fora do denominador', () => {
    const encontros = [
      enc('e1', h(-48), { moduloId: 'mod1' }),                         // presente
      enc('e2', h(-24), { moduloId: 'mod1', aulaGravadaId: 'a2' }),    // compensado pela gravada
      enc('e3', h(-10)),                                               // falta (sem módulo: só no geral)
      enc('e4', h(-0.5)),                                              // em andamento
      enc('e5', h(+48))                                                // futuro
    ];
    const f = calcularFrequencia(MAT, AGORA, {
      encontros,
      aulas: [aula('a1'), aula('a2')],
      frequencias: [
        { origem: 'ao_vivo', encontroId: 'e1', codigo: 'FRQ-P' },
        { origem: 'gravado', aulaId: 'a2', codigo: 'FRQ-G' }
      ]
    });
    const estados = Object.fromEntries(f.porEncontro.map(e => [e.encontroId, e.estado]));
    assert.deepEqual(estados, { e1: 'presente', e2: 'compensado', e3: 'falta', e4: 'em_andamento', e5: 'futuro' });
    // a2 é a gravada vinculada a e2: sai de A. A = { a1 } pendente.
    assert.equal(f.contaveis, 4);           // presente + compensado + falta + |A|
    assert.equal(f.presente, 1);
    assert.equal(f.compensado, 1);
    assert.equal(f.faltas, 1);
    assert.equal(f.pendentes, 2);            // a1 pendente + e4 em andamento
    assert.equal(f.frequenciaPct, 50);
    assert.equal(f.aoVivoPct, 25);
    assert.equal(f.gravadoPct, 25);
    assert.equal(f.aoVivoPct + f.gravadoPct, f.frequenciaPct);
    assert.equal(f.porEncontro.find(e => e.encontroId === 'e2').codigo, 'FRQ-G');
    // por módulo: e1, e2 e a1 (e3 sem módulo fica só no geral)
    assert.equal(f.porModulo.mod1.contaveis, 3);
    assert.equal(f.porModulo.mod1.faltas, 0);
  });

  test('encontro de outra turma e cancelado são ignorados; anulada não conta', () => {
    const f = calcularFrequencia(MAT, AGORA, {
      encontros: [
        enc('x1', h(-48), { turmaId: 'T2' }),
        enc('x2', h(-48), { cancelado: true }),
        enc('x3', h(-48), { turmaId: 'T1' })
      ],
      frequencias: [{ origem: 'ao_vivo', encontroId: 'x3', anulada: { em: AGORA, motivo: 'x' } }]
    });
    assert.deepEqual(f.porEncontro.map(e => e.encontroId), ['x3']);
    assert.equal(f.faltas, 1);
    assert.equal(f.frequenciaPct, 0);
  });

  test('somas com dízima: aoVivo + gravado = total (1 casa)', () => {
    const f = calcularFrequencia(MAT, AGORA, {
      encontros: [enc('e1', h(-5))],
      aulas: [aula('a1'), aula('a2')],
      frequencias: [{ origem: 'ao_vivo', encontroId: 'e1' }, { origem: 'gravado', aulaId: 'a1' }]
    });
    assert.equal(f.frequenciaPct, 66.7, 'geral arredondada do valor exato (2/3)');
    assert.equal(f.aoVivoPct, 33.3);
    assert.equal(f.gravadoPct, 33.4, 'a parte gravada leva o resíduo do arredondamento');
    assert.equal(umaCasa(f.aoVivoPct + f.gravadoPct), f.frequenciaPct);
  });
});

describe('situação do módulo (CEO-4)', () => {
  const comModular = (nota, extra = {}) => ({ temModular: true, nota, tentativas: { restantes: 0 }, ...extra });
  test('sem modular: concluído com 100% das aulas, senão cursando', () => {
    assert.equal(situacaoModulo({ temModular: false, aulasTotal: 3, aulasConcluidas: 3 }), 'concluido');
    assert.equal(situacaoModulo({ temModular: false, aulasTotal: 3, aulasConcluidas: 2 }), 'cursando');
    assert.equal(situacaoModulo({ temModular: false, aulasTotal: 0, aulasConcluidas: 0 }), 'cursando');
  });
  test('as 4 situações do CEO', () => {
    assert.equal(situacaoModulo(comModular(null)), 'cursando');
    assert.equal(situacaoModulo(comModular(7)), 'aprovado');
    assert.equal(situacaoModulo(comModular(6.9, { tentativas: { restantes: 1 } })), 'em_recuperacao');
    assert.equal(situacaoModulo(comModular(6.9)), 'reprovado');
  });
  test('finalizada com nota < 7 → reprovado; concessão (restantes > 0) → em recuperação; aguardando correção', () => {
    assert.equal(situacaoModulo(comModular(5, { tentativas: { restantes: 2 }, finalizada: true })), 'reprovado');
    assert.equal(situacaoModulo(comModular(5, { tentativas: { restantes: 1 }, finalizada: false })), 'em_recuperacao');
    assert.equal(situacaoModulo(comModular(5, { aguardandoCorrecao: true })), 'em_recuperacao');
  });
  test('nota mínima configurada', () => {
    assert.equal(situacaoModulo(comModular(6), 6), 'aprovado');
    assert.equal(situacaoModulo(comModular(7.5), 8), 'reprovado');
  });
  test('rótulos', () => {
    assert.equal(rotuloDaSituacao('cursando', { aguardandoCorrecao: true }), 'Aguardando correção');
    assert.equal(rotuloDaSituacao('cursando', { iniciado: false }), 'Não iniciado');
    assert.equal(rotuloDaSituacao('em_recuperacao'), 'Em recuperação');
  });
});

describe('elegibilidade e situação do curso (§8.11, DC-66)', () => {
  const base = { curso: {}, aulasTotal: 4, aulasConcluidas: 4, frequenciaPct: 100, modulos: [] };
  test('curso sem critérios e sem modular: igual a hoje (regra aulas)', () => {
    assert.deepEqual(calcularElegibilidade(base), { elegivel: true, regra: 'aulas', pendencias: [] });
    const falta = calcularElegibilidade({ ...base, aulasConcluidas: 3 });
    assert.equal(falta.elegivel, false);
    assert.equal(falta.pendencias[0].texto, 'Conclua todas as aulas para emitir o certificado. Faltam 1 de 4.');
  });
  test('regra aprovacao: módulo com modular não aprovado bloqueia', () => {
    const r = calcularElegibilidade({ ...base, modulos: [{ moduloId: 'm1', numero: '01', temModular: true, situacao: 'em_recuperacao' }, { moduloId: 'm2', temModular: false, situacao: 'concluido' }] });
    assert.equal(r.regra, 'aprovacao');
    assert.equal(r.elegivel, false);
    assert.equal(r.pendencias[0].tipo, 'modulo');
    assert.equal(calcularElegibilidade({ ...base, modulos: [{ moduloId: 'm1', temModular: true, situacao: 'aprovado' }] }).elegivel, true);
  });
  test('frequenciaMinima NAS DUAS regras; null com mínimo → pendência', () => {
    const curso = { criterios: { frequenciaMinima: 75 } };
    const r = calcularElegibilidade({ ...base, curso, frequenciaPct: 60 });
    assert.equal(r.regra, 'aulas');
    assert.deepEqual(r.pendencias, [{ tipo: 'frequencia', texto: 'Frequência de 60%; o mínimo do curso é 75%.' }]);
    const r2 = calcularElegibilidade({ ...base, curso, frequenciaPct: 60, modulos: [{ moduloId: 'm1', temModular: true, situacao: 'aprovado' }] });
    assert.equal(r2.regra, 'aprovacao');
    assert.equal(r2.elegivel, false);
    assert.equal(calcularElegibilidade({ ...base, curso, frequenciaPct: null }).pendencias[0].texto, 'Frequência ainda não apurada.');
  });
  test('cargaMinimaHoras acima da carga do curso → pendência carga', () => {
    const r = calcularElegibilidade({ ...base, curso: { cargaHoraria: '12h', criterios: { cargaMinimaHoras: 360 } } });
    assert.equal(r.pendencias[0].tipo, 'carga');
  });
  test('TCC: sem módulo, sem modular, concluído por aulas não basta, reprovado, aprovado', () => {
    const curso = { criterios: { exigeTcc: true } };
    assert.equal(calcularElegibilidade({ ...base, curso }).pendencias[0].texto, 'Curso sem módulo de TCC definido.');
    assert.equal(calcularElegibilidade({ ...base, curso, modulos: [{ moduloId: 't', tipo: 'tcc', temModular: false, situacao: 'concluido' }] }).pendencias[0].texto, 'Avaliação do TCC não publicada.');
    assert.equal(calcularElegibilidade({ ...base, curso, modulos: [{ moduloId: 't', tipo: 'tcc', temModular: true, situacao: 'reprovado' }] }).elegivel, false);
    assert.equal(calcularElegibilidade({ ...base, curso, modulos: [{ moduloId: 't', tipo: 'tcc', temModular: true, situacao: 'aprovado' }] }).elegivel, true);
    assert.equal(calcularElegibilidade({ ...base, curso, avaliacoesDisponiveis: false, modulos: [{ moduloId: 't', tipo: 'tcc', temModular: false }] }).pendencias[0].texto, 'Avaliação do TCC indisponível no momento.');
  });
  test('lato sensu bloqueia (certificado pela IES)', () => {
    const r = calcularElegibilidade({ ...base, curso: { nivel: 'pos_graduacao_lato_sensu' } });
    assert.equal(r.elegivel, false);
    assert.equal(r.pendencias[0].tipo, 'certificado-pela-ies');
  });
  test('situação do curso', () => {
    assert.equal(situacaoCurso({ elegibilidade: { elegivel: true, regra: 'aprovacao' } }), 'aprovado');
    assert.equal(situacaoCurso({ elegibilidade: { elegivel: true, regra: 'aulas' } }), 'concluido');
    assert.equal(situacaoCurso({ elegibilidade: { elegivel: false }, modulos: [{ situacao: 'reprovado' }] }), 'reprovado');
    assert.equal(situacaoCurso({ elegibilidade: { elegivel: false }, modulos: [{ situacao: 'cursando' }] }), 'cursando');
    assert.equal(situacaoCurso({ matricula: { status: 'concluida', resultadoFinal: { regra: 'aprovacao' } } }), 'aprovado');
  });
  test('média parcial', () => {
    assert.equal(mediaParcial([]), null);
    assert.equal(mediaParcial([null, 8, 9]), 8.5);
    assert.equal(mediaParcial([7, 8, 8]), 7.7);
  });
});

describe('encontros', () => {
  test('equivalência com statusDaLive do legado', () => {
    for (const desloc of [-200, -91, -90, -60, -1, 0, 14, 15, 16, 120]) {
      const live = { inicioEm: new Date(AGORA.getTime() + desloc * 60000), duracaoMin: 90 };
      assert.equal(statusDoEncontro(live, AGORA), statusDaLive(live, AGORA.getTime()), `deslocamento ${desloc} min`);
    }
    assert.equal(statusDoEncontro({ inicioEm: AGORA, cancelado: true }, AGORA), 'cancelada');
  });
  test('visibilidade §8.6', () => {
    assert.equal(encontroVisivel({ cursoId: 'c1', turmaId: null }, MAT), true);
    assert.equal(encontroVisivel({ cursoId: 'c1', turmaId: 'T1' }, MAT), true);
    assert.equal(encontroVisivel({ cursoId: 'c1', turmaId: 'T2' }, MAT), false);
    assert.equal(encontroVisivel({ cursoId: 'c2', turmaId: null }, MAT), false);
    assert.equal(encontroVisivel({ cursoId: 'c1', cancelado: true }, MAT), false);
  });
  test('nível: lato sensu só com IES ativa, nunca "reconhecido"', () => {
    assert.equal(nivelRotulo({ nivel: 'curso_livre' }), 'Curso livre');
    assert.equal(nivelRotulo({ nivel: 'pos_graduacao_lato_sensu' }), null);
    assert.equal(nivelRotulo({ nivel: 'pos_graduacao_lato_sensu' }, { nome: 'IES X', ativa: true }), 'Pós-graduação lato sensu · ofertado por IES X');
    assert.doesNotMatch(String(nivelRotulo({ nivel: 'pos_graduacao_lato_sensu' }, { nome: 'IES X', ativa: true })), /reconhecid|MEC/i);
  });
});
