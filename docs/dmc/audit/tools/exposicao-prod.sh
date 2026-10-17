#!/usr/bin/env bash
# Sonda em produção os caminhos que NÃO podem responder 200 (segredos, código do server/)
# e os que PRECISAM continuar 200 (EAD/API — D5). Uso: tools/exposicao-prod.sh [saida.txt]
# Só lê status e tamanho (HEAD/GET sem salvar corpo). Inclui server/.env.bak-atlas.
OUT="${1:-/dev/stdout}"; H="https://www.complexodmc.com.br"
PROIBIDOS=(/server/.env /server/.env.bak-atlas /server/.env.example /server/.env.local /server/.env.production /server/README.md /server/package.json /server/package-lock.json /server/src/server.js /server/src/config.js /server/src/db.js /server/src/auth.js /server/scripts/seed.js /server/scripts/create-admin.js /server/uploads/capas/capa-7cd3d13b1658.png /server/uploads/materiais/mat-377044cb3279.pdf /.env /.env.local /.vercel/project.json /.vercel/.env.production.local /vercel.json /.vercelignore /package.json /docs/dmc/BRIEF.md /complexodmc.com.br/_np_diag.html)
OBRIGATORIOS=(/ /api/health /plataforma-ead/ /plataforma-ead/js/app.js /assets/images/RINO_logo.png /assets/images/LOGO_RINOCERONTE.png /solucoes/consultoria-trabalhista/ciclo-fechado /robots.txt /sitemap.xml)
{
  echo "# Exposição em produção — $(date -u +%Y-%m-%dT%H:%M:%SZ) — $H"
  echo "## Devem ser 404/3xx (falhou = 200)"; falhas=0
  for p in "${PROIBIDOS[@]}"; do r=$(curl -s -o /dev/null -w "%{http_code} %{size_download}" -m 20 "$H$p"); c=${r%% *}; [ "$c" = "200" ] && { v="FALHOU"; falhas=$((falhas+1)); } || v="ok"; printf "%-7s %s %s\n" "$v" "$r" "$p"; done
  echo "## Devem ser 200 (D5 / roteamento)"
  for p in "${OBRIGATORIOS[@]}"; do r=$(curl -s -o /dev/null -w "%{http_code} %{size_download}" -m 20 "$H$p"); c=${r%% *}; [ "$c" = "200" ] && v="ok" || { v="FALHOU"; falhas=$((falhas+1)); }; printf "%-7s %s %s\n" "$v" "$r" "$p"; done
  echo "# total de falhas: $falhas"
} | tee "$OUT" >/dev/null; cat "$OUT" 2>/dev/null | tail -1
