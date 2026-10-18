// =============================================================
// URLs hospedeiras da F2 para o portal-qualidade (D-74): a avaliação do
// aluno só existe dentro do player (aula.html, F1b) e as telas do
// professor só dentro de professor.html (F8).
// ctx: { cursoId, moduloId, avaliacaoId, tentativaId } semeados pelo caso.
// =============================================================
export const PAGINAS = [
  {
    pagina: 'aula.html', fatia: 'F2', hospedeira: true, papel: 'aluno',
    url: (ctx = {}) => (ctx.cursoId && ctx.avaliacaoId
      ? `aula.html?curso=${encodeURIComponent(ctx.cursoId)}&modulo=${encodeURIComponent(ctx.moduloId)}&item=${encodeURIComponent(`avaliacao:${ctx.avaliacaoId}`)}`
      : 'aula.html')
  },
  { pagina: 'professor.html', fatia: 'F2', hospedeira: true, papel: 'professor', url: () => 'professor.html#/avaliacoes' },
  { pagina: 'professor.html', fatia: 'F2', hospedeira: true, papel: 'professor', url: () => 'professor.html#/correcao' },
  { pagina: 'professor.html', fatia: 'F2', hospedeira: true, papel: 'professor', url: (ctx = {}) => (ctx.avaliacaoId ? `professor.html#/avaliacoes/${ctx.avaliacaoId}/questoes` : 'professor.html#/avaliacoes') },
  { pagina: 'professor.html', fatia: 'F2', hospedeira: true, papel: 'professor', url: (ctx = {}) => (ctx.avaliacaoId ? `professor.html#/avaliacoes/${ctx.avaliacaoId}/previa` : 'professor.html#/avaliacoes') }
];
