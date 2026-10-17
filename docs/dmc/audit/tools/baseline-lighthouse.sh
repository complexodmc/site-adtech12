#!/usr/bin/env bash
# Lighthouse mobile baseline — 4 páginas do servidor local.
# Uso: bash docs/dmc/audit/tools/baseline-lighthouse.sh
set -u
ROOT="/Users/dmchagas/Site_Complexo_DMC"
OUT="$ROOT/docs/dmc/audit/2026-10-17/metricas-baseline/lighthouse"
BASE="http://127.0.0.1:8080/complexodmc.com.br"
mkdir -p "$OUT"
export CHROME_PATH="${CHROME_PATH:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

declare -a PAGES=(
  "home|$BASE/index.html"
  "planejamento-sucessorio|$BASE/pages/planejamento-sucessorio.html"
  "consultoria-imobiliaria|$BASE/pages/consultoria-imobiliaria.html"
  "ciclo-fechado|$BASE/solucoes/consultoria-trabalhista/ciclo-fechado.html"
)

for entry in "${PAGES[@]}"; do
  name="${entry%%|*}"; url="${entry#*|}"
  echo "== $name  $url"
  npx --no-install lighthouse "$url" \
    --chrome-flags="--headless=new --no-sandbox --disable-gpu" \
    --form-factor=mobile --screenEmulation.mobile \
    --only-categories=performance,accessibility,best-practices,seo \
    --output=json --output=html \
    --output-path="$OUT/$name" \
    --quiet 2>&1 | tail -5
  ls -la "$OUT/$name".report.* 2>/dev/null
done
echo "DONE"
