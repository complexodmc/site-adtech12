#!/usr/bin/env bash
# Porta de deploy (rodar ANTES de qualquer `vercel deploy`/push): faz `vercel build` e confere
#  1) a função api/[...path].func contém server/src/server.js e responde /api/health (D5);
#  2) o estático não contém server/ nem .env*.
# Uso: tools/vercel-build-check.sh [raiz-do-repo]   → imprime APROVADO/FALHOU e sai 0/1.
set -u; R="${1:-$(pwd)}"; cd "$R" || exit 1
npx --yes vercel@64.5.0 build --yes >/tmp/vercel-build.log 2>&1 || { tail -20 /tmp/vercel-build.log; echo "FALHOU: vercel build"; exit 1; }
F=".vercel/output/functions/api/[...path].func"; ST=".vercel/output/static"; ok=1
[ -f "$F/server/src/server.js" ] && echo "ok   função contém server/src/server.js" || { echo "FALHOU função sem server/src/server.js (quebra /api/* — D5)"; ok=0; }
n=$(find "$ST" -path "*/server/*" -type f | wc -l | tr -d ' '); [ "$n" = "0" ] && echo "ok   estático sem server/" || { echo "FALHOU estático publica $n arquivos de server/"; ok=0; }
n=$(find "$ST" -name '.env*' -type f | wc -l | tr -d ' '); [ "$n" = "0" ] && echo "ok   estático sem .env*" || { echo "FALHOU estático publica $n .env*"; ok=0; }
[ -f "$ST/server/.env.bak-atlas" ] && { echo "FALHOU .env.bak-atlas no estático"; ok=0; }
node "$(dirname "$0")/vercel-func-smoke.mjs" "$F" | grep -q '"status":200' && echo "ok   /api/health 200 pela função empacotada" || { echo "FALHOU smoke da função (import/health)"; ok=0; }
[ "$ok" = "1" ] && echo "APROVADO" || { echo "FALHOU"; exit 1; }
