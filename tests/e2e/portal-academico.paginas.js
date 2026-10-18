// =============================================================
// Páginas da F3a para o portal-qualidade (D-74): Acadêmico, Aulas ao vivo e
// Comprovantes (páginas próprias) e as telas de backoffice que a F3a registra
// em professor.html (hospedeira da F8, P1f): agenda de encontros e matriz de
// frequência da turma. `url(ctx)`: com ctx.matriculaId/ctx.cursoId/ctx.turmaId
// abre o recorte semeado; sem eles, a tela inteira (ou o vazio honesto).
// =============================================================
export const PAGINAS = [
  { pagina: 'academico.html', fatia: 'F3a', url: (ctx = {}) => (ctx.matriculaId ? `academico.html?m=${encodeURIComponent(ctx.matriculaId)}` : 'academico.html') },
  { pagina: 'ao-vivo.html', fatia: 'F3a', url: (ctx = {}) => (ctx.cursoId ? `ao-vivo.html?curso=${encodeURIComponent(ctx.cursoId)}` : 'ao-vivo.html') },
  { pagina: 'comprovantes.html', fatia: 'F3a', url: (ctx = {}) => (ctx.cursoId ? `comprovantes.html?curso=${encodeURIComponent(ctx.cursoId)}` : 'comprovantes.html') },
  { pagina: 'professor.html', fatia: 'F3a', hospedeira: true, papel: 'admin', url: () => 'professor.html#/ao-vivo' },
  { pagina: 'professor.html', fatia: 'F3a', hospedeira: true, papel: 'admin', url: (ctx = {}) => (ctx.turmaId ? `professor.html#/turmas/${encodeURIComponent(ctx.turmaId)}/frequencia` : 'professor.html#/ao-vivo/novo') }
];
