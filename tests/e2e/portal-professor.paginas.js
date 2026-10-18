// =============================================================
// Páginas da F8 para o portal-qualidade (D-74): professor.html (rotas da
// própria F8), admin.html (editor de cursos) e parcerias.html — todas com a
// coordenação (papel admin); a Visão geral também com o professor.
// =============================================================
export const PAGINAS = [
  { pagina: 'professor.html', fatia: 'F8', papel: 'admin', url: () => 'professor.html#/inicio' },
  { pagina: 'professor.html', fatia: 'F8', hospedeira: true, papel: 'professor', url: () => 'professor.html#/duvidas' },
  { pagina: 'professor.html', fatia: 'F8', hospedeira: true, papel: 'admin', url: () => 'professor.html#/turmas' },
  { pagina: 'professor.html', fatia: 'F8', hospedeira: true, papel: 'admin', url: () => 'professor.html#/equipe' },
  { pagina: 'professor.html', fatia: 'F8', hospedeira: true, papel: 'admin', url: () => 'professor.html#/alunos' }
];
