// =============================================================
// COMPLEXO DMC · Portal — CSV (Excel pt-BR) com proteção contra fórmula
// PORTAL-API §4.13 · índice D-24 (CPF nunca vai em CSV) · dono: F0a.
//
// BOM + ';' + CRLF; aspas duplicadas; célula de texto que começa com
// = + - @ TAB ou CR recebe ' na frente; vírgula decimal; moeda a partir
// de centavos; datas no fuso de São Paulo.
// =============================================================
import { ErroPortal } from './erros.js';

export const LIMITE_LINHAS_CSV = 20000;
export const TIPOS_COLUNA = Object.freeze(['texto', 'numero', 'moeda', 'data', 'dataHora', 'pct', 'nota']);

const FMT_DATA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' });
const FMT_HORA = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const FMT_ISO_SP = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

function comoData(v) {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

function decimal(n, casas = null) {
  const s = casas === null ? String(n) : n.toFixed(casas);
  return s.replace('.', ',');
}

/** Texto seguro para planilha: prefixa ' quando começaria uma fórmula. */
export function antiFormula(s) {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function comoTexto(v) {
  if (v === null || v === undefined) return '';
  if (Array.isArray(v)) return v.map(comoTexto).join(', ');
  if (v instanceof Date) return comoData(v) ? v.toISOString() : '';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

/** Valor formatado (antes das aspas). Valor de tipo inesperado vira texto protegido. */
export function formatarCelula(valor, tipo = 'texto') {
  if (valor === null || valor === undefined || valor === '') return '';
  const numero = typeof valor === 'number' && Number.isFinite(valor);
  switch (tipo) {
    case 'numero':
      if (numero) return decimal(valor);
      break;
    case 'moeda':
      if (numero) {
        const centavos = Math.round(valor);
        const sinal = centavos < 0 ? '-' : '';
        const abs = Math.abs(centavos);
        return `${sinal}${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`;
      }
      break;
    case 'pct':
    case 'nota':
      if (numero) return decimal(Math.round(valor * 10) / 10, 1);
      break;
    case 'data': {
      if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor)) {
        const [a, m, d] = valor.split('-');
        return `${d}/${m}/${a}`;
      }
      const d = comoData(valor);
      if (d) return FMT_DATA.format(d);
      break;
    }
    case 'dataHora': {
      const d = comoData(valor);
      if (d) return `${FMT_DATA.format(d)} ${FMT_HORA.format(d)}`;
      break;
    }
    default:
      break;
  }
  return antiFormula(comoTexto(valor));
}

function aspas(s) {
  return /[;"\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * @param {{ chave:string, rotulo:string, tipo?:string }[]} colunas
 * @param {object[]} linhas
 * @returns {string} CSV com BOM, ';' e CRLF
 */
export function gerarCsv(colunas, linhas) {
  if (!Array.isArray(colunas) || !colunas.length) throw new TypeError('gerarCsv: informe as colunas.');
  const cab = colunas.map(c => aspas(antiFormula(String(c.rotulo ?? c.chave)))).join(';');
  const corpo = (linhas || []).map(l => colunas.map(c => aspas(formatarCelula(l?.[c.chave], c.tipo || 'texto'))).join(';'));
  return '﻿' + [cab, ...corpo].join('\r\n') + '\r\n';
}

/**
 * Envia o CSV como anexo, sem cache. Acima de LIMITE_LINHAS_CSV → ErroPortal 413 'relatorio-grande'.
 * @param {{ agora?: Date|(() => Date) }} opcoes
 */
export function enviarCsv(res, id, colunas, linhas, { agora = () => new Date() } = {}) {
  if ((linhas?.length || 0) > LIMITE_LINHAS_CSV) {
    throw new ErroPortal(413, 'relatorio-grande', undefined, { limite: LIMITE_LINHAS_CSV });
  }
  const momento = typeof agora === 'function' ? agora() : agora instanceof Date ? agora : new Date();
  const dia = FMT_ISO_SP.format(momento);
  const nome = `dmc-${String(id || 'relatorio').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '') || 'relatorio'}-${dia}.csv`;
  res.set('Content-Type', 'text/csv; charset=utf-8');
  res.set('Content-Disposition', `attachment; filename="${nome}"`);
  res.set('Cache-Control', 'no-store');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(gerarCsv(colunas, linhas));
}
