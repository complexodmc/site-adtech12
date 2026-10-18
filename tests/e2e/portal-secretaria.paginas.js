// =============================================================
// Páginas da F4a para o portal-qualidade (D-74): a F4a não tem página
// própria; as telas de Matrículas e Nova turma vivem em professor.html
// (hospedeira da F8, P1f). Abrem com a coordenação (papel admin).
// =============================================================
export const PAGINAS = [
  { pagina: 'professor.html', fatia: 'F4a', hospedeira: true, papel: 'admin', url: () => 'professor.html#/matriculas' },
  { pagina: 'professor.html', fatia: 'F4a', hospedeira: true, papel: 'admin', url: () => 'professor.html#/turmas/nova' }
];
