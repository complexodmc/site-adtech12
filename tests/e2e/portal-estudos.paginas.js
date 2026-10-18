// =============================================================
// Páginas da F1b para o portal-qualidade (D-74): Início, Meus cursos e player.
// `url(ctx)`: com ctx.cursoId o player abre o curso semeado; sem ele, o próximo
// conteúdo do curso ativo (ou o vazio honesto).
// =============================================================
export const PAGINAS = [
  { pagina: 'dashboard.html', fatia: 'F1b', url: (ctx = {}) => (ctx.cursoId ? `dashboard.html?curso=${encodeURIComponent(ctx.cursoId)}` : 'dashboard.html') },
  { pagina: 'meus-cursos.html', fatia: 'F1b', url: () => 'meus-cursos.html' },
  { pagina: 'aula.html', fatia: 'F1b', url: (ctx = {}) => (ctx.cursoId ? `aula.html?curso=${encodeURIComponent(ctx.cursoId)}` : 'aula.html') }
];
