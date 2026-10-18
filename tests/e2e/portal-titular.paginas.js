// =============================================================
// Páginas da F0p (PORTAL-ACADEMICO.md §8.1, D-74): o que o portal-qualidade e o
// monitor de console e rede abrem como "páginas da fatia". As cinco já estão em
// PAGINAS_BASE com a fatia F0p; a entrada própria aqui as substitui (mesma fatia)
// e diz como abri-las (busca com termo; acesso-link no modo #pedir-link, UX §8.5).
// =============================================================
export const PAGINAS = [
  { pagina: 'perfil.html', fatia: 'F0p', papel: 'aluno', url: 'perfil.html' },
  { pagina: 'meus-dados.html', fatia: 'F0p', papel: 'aluno', url: 'meus-dados.html' },
  { pagina: 'notificacoes.html', fatia: 'F0p', papel: 'aluno', url: 'notificacoes.html' },
  { pagina: 'busca.html', fatia: 'F0p', papel: 'aluno', url: 'busca.html?q=curso' },
  { pagina: 'acesso-link.html', fatia: 'F0p', papel: 'anonimo', url: 'acesso-link.html#pedir-link' }
];

export default { PAGINAS };
