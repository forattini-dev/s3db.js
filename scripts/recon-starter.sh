#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 dominio.com [wordlist]" >&2
  exit 1
fi

TARGET="$1"
WORDLIST="${2:-}"
STAMP="$(date -u +%Y%m%d%H%M%S)"
OUT="recon_${TARGET}_${STAMP}"
mkdir -p "$OUT"

log() { printf '[%s] %s\n' "$(date -u +%H:%M:%S)" "$1"; }
run_if_exists() {
  if command -v "$1" >/dev/null 2>&1; then
    "$@"
  else
    log "skipping: $1 não encontrado"
    return 1
  fi
}

log "Subdomínios (subfinder)"
run_if_exists subfinder -d "$TARGET" -silent > "$OUT/subs_subfinder.txt" || true

log "Subdomínios (amass)"
run_if_exists amass enum -d "$TARGET" -o "$OUT/amass.txt" || true

cat "$OUT"/subs_subfinder.txt "$OUT"/amass.txt 2>/dev/null \
  | sort -u > "$OUT/subs_all.txt"

log "Resolvendo hosts"
while read -r host; do
  [[ -z "$host" ]] && continue
  dig +short "$host" \
    | awk -v h="$host" '{print h","$0}'
done < "$OUT/subs_all.txt" > "$OUT/resolved.csv"

awk -F, '{print $2}' "$OUT/resolved.csv" \
  | grep -E '^[0-9]+' | sort -u | head -n 40 > "$OUT/top_ips.txt"

if [[ -s "$OUT/top_ips.txt" ]]; then
  log "Nmap (top host list)"
  run_if_exists nmap -sC -sV -iL "$OUT/top_ips.txt" \
    -oA "$OUT/nmap_quick" || true
fi

log "Capturando headers/robots/sitemaps"
while read -r host; do
  [[ -z "$host" ]] && continue
  run_if_exists curl -sI "https://$host" >> "$OUT/headers.txt" || true
  run_if_exists curl -s "https://$host/robots.txt" \
    -o "$OUT/robots_${host}.txt" || true
  run_if_exists curl -s "https://$host/sitemap.xml" \
    -o "$OUT/sitemap_${host}.xml" || true
done < "$OUT/subs_all.txt"

if [[ -n "$WORDLIST" && -f "$WORDLIST" ]]; then
  log "Bruteforce HTTP (ffuf)"
  run_if_exists ffuf -u "https://$TARGET/FUZZ" \
    -w "$WORDLIST" -t 40 -of json -o "$OUT/ffuf.json" || true
fi

log "Finalizado. Resultados em $OUT/"
