// =============================================================
// COMPLEXO DMC · Portal — textos de consentimento do PERFIL (v1)
// PORTAL-API §3.3 (consentimentos), §6.3.1, §6.3.3 · índice D-55 · dono: F0t.
//
// Textos LITERAIS exibidos ao titular e cujo sha256 vai gravado no
// aceite (`consentimentos.textoSha256`). Revisão jurídica pendente
// (índice §13, LGPD). O texto do Assistente de IA NÃO mora aqui: é da
// F6b (`ia/instrucao.js`), que grava pelo serviço `consentimentos.*`.
//
// Mudar uma palavra = versão nova ('v2'), nunca editar a 'v1'.
// =============================================================
import { createHash } from 'node:crypto';

export const VERSAO_TEXTO_ATUAL = 'v1';

/** As 5 finalidades do perfil (aceite pela tela de Perfil ou de Meus dados). */
export const FINALIDADES_PERFIL = Object.freeze(['perfil_genero', 'perfil_etnia', 'perfil_nome_social', 'perfil_redes', 'perfil_foto']);

/** As 6 finalidades de §3.3 (inclui a do assistente, gravada pela F6b pelo mesmo serviço). */
export const FINALIDADES = Object.freeze([...FINALIDADES_PERFIL, 'assistente_ia']);

/** Chave do espelho em `perfis.consentimentos` e do bloco `consentimentos` do PUT do perfil. */
export const CHAVE_ESPELHO = Object.freeze({
  perfil_genero: 'genero',
  perfil_etnia: 'etnia',
  perfil_nome_social: 'nomeSocial',
  perfil_redes: 'redes',
  perfil_foto: 'foto'
});

/** Inverso de CHAVE_ESPELHO: 'genero' → 'perfil_genero'. */
export const FINALIDADE_DA_CHAVE = Object.freeze(Object.fromEntries(Object.entries(CHAVE_ESPELHO).map(([f, k]) => [k, f])));

const TEXTO_DIVERSIDADE = (dado) => `Autorizo o registro ${dado} para estatísticas agregadas de diversidade da plataforma. A informação aparece só para mim; a coordenação vê apenas totais de grupos com 5 ou mais pessoas, e ela nunca é usada em decisões sobre mim nem mostrada à equipe. Posso retirar a autorização em Meus dados, e a informação é apagada.`;

/** Textos por finalidade e versão (literais da API §6.3.1 e da D-55). */
export const TEXTOS = Object.freeze({
  perfil_nome_social: Object.freeze({
    v1: 'Autorizo o uso do nome social informado como meu nome de exibição no portal e na comunicação comigo. Ele aparece para a coordenação e para os professores das minhas turmas. Posso retirar a autorização em Meus dados; o portal volta a usar o nome de registro.'
  }),
  perfil_redes: Object.freeze({
    v1: 'Autorizo o registro dos meus perfis de redes sociais para contato da coordenação. Eles não aparecem para professores nem para outros alunos. Posso retirar a autorização em Meus dados, e os perfis são apagados.'
  }),
  perfil_foto: Object.freeze({
    v1: 'Autorizo o uso da minha foto no portal. Ela aparece para mim, para a coordenação e para os professores das minhas turmas. Posso retirá-la ou retirar a autorização em Meus dados, e a foto é apagada.'
  }),
  perfil_genero: Object.freeze({ v1: TEXTO_DIVERSIDADE('do meu gênero') }),
  perfil_etnia: Object.freeze({ v1: TEXTO_DIVERSIDADE('da minha cor ou etnia (classificação do IBGE)') })
});

/** Rótulo de cada finalidade (Meus dados). */
export const ROTULOS = Object.freeze({
  assistente_ia: 'Assistente de IA',
  perfil_genero: 'Gênero',
  perfil_etnia: 'Cor ou etnia',
  perfil_nome_social: 'Nome social',
  perfil_redes: 'Redes sociais',
  perfil_foto: 'Foto do perfil'
});

/** Consequência de retirar a autorização (exibida literalmente na confirmação — UX §6.16). */
export const EFEITO_REVOGACAO = Object.freeze({
  assistente_ia: 'O assistente deixa de responder a você até uma nova autorização. A trilha técnica das respostas é mantida pelo prazo de retenção.',
  perfil_genero: 'O gênero informado é apagado agora.',
  perfil_etnia: 'A cor ou etnia informada é apagada agora.',
  perfil_nome_social: 'O nome social é apagado agora e o portal volta a usar o nome de registro.',
  perfil_redes: 'Os perfis de redes sociais são apagados agora.',
  perfil_foto: 'A foto do perfil é apagada agora.'
});

const sha256 = s => createHash('sha256').update(String(s), 'utf8').digest('hex');

/** → { versaoTexto, texto, textoSha256 } da finalidade do perfil, ou null (finalidade/versão desconhecida). */
export function textoConsentimento(finalidade, versaoTexto = VERSAO_TEXTO_ATUAL) {
  const t = TEXTOS[finalidade]?.[versaoTexto];
  if (typeof t !== 'string') return null;
  return { versaoTexto, texto: t, textoSha256: sha256(t) };
}

/** Os 5 textos da versão atual para `textosConsentimento` de GET /portal/me/perfil: { finalidade: { versaoTexto, texto } }. */
export function textosParaTela() {
  const out = {};
  for (const f of FINALIDADES_PERFIL) {
    const t = textoConsentimento(f);
    out[f] = { versaoTexto: t.versaoTexto, texto: t.texto };
  }
  return out;
}
