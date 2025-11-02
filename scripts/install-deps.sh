#!/usr/bin/env bash

# s3db.js Development Dependency Installer
# Installs only the dependencies you need for development

set -e

CYAN='\033[0;36m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

print_header() {
  echo -e "${CYAN}"
  echo "╔═══════════════════════════════════════════════════════════════╗"
  echo "║        s3db.js - Modular Development Dependency Setup        ║"
  echo "╚═══════════════════════════════════════════════════════════════╝"
  echo -e "${NC}"
}

print_menu() {
  echo -e "${YELLOW}Choose your development setup:${NC}\n"
  echo "  1) Minimal      - Core only (~50MB) - Recommended for most work"
  echo "  2) Common       - Core + Replicators + Plugins (~500MB)"
  echo "  3) Full         - Everything (~2GB) - For comprehensive testing"
  echo ""
  echo "  4) Replicators  - PostgreSQL, BigQuery, MySQL, SQS (~500MB)"
  echo "  5) Plugins      - API, Identity, ML, Scheduler (~300MB)"
  echo "  6) Puppeteer    - Web scraping suite (~400MB)"
  echo "  7) Cloud        - AWS SDK clients (~800MB)"
  echo ""
  echo "  0) Exit"
  echo ""
}

install_minimal() {
  echo -e "${GREEN}Installing minimal dependencies (core only)...${NC}"
  pnpm install
  echo -e "${GREEN}✅ Minimal setup complete!${NC}"
  echo "You can now work on core database features."
}

install_common() {
  echo -e "${GREEN}Installing common dependencies...${NC}"
  pnpm install
  pnpm run install:dev:replicators
  pnpm run install:dev:plugins
  echo -e "${GREEN}✅ Common setup complete!${NC}"
  echo "You can now work on most plugins and replicators."
}

install_full() {
  echo -e "${YELLOW}⚠️  Installing ALL dependencies (~2GB, may take 10+ minutes)...${NC}"
  read -p "Are you sure? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    pnpm install
    pnpm run install:dev:full
    echo -e "${GREEN}✅ Full setup complete!${NC}"
    echo "All dependencies installed. Ready for comprehensive testing."
  else
    echo "Cancelled."
  fi
}

install_replicators() {
  echo -e "${GREEN}Installing database replicators...${NC}"
  pnpm run install:dev:replicators
  echo -e "${GREEN}✅ Replicators installed!${NC}"
  echo "Available: PostgreSQL, BigQuery, PlanetScale, Turso, SQS, RabbitMQ"
}

install_plugins() {
  echo -e "${GREEN}Installing plugin dependencies...${NC}"
  pnpm run install:dev:plugins
  echo -e "${GREEN}✅ Plugins installed!${NC}"
  echo "Available: API, Identity, ML, Scheduler, TTL, Cache"
}

install_puppeteer() {
  echo -e "${GREEN}Installing Puppeteer suite...${NC}"
  pnpm run install:dev:puppeteer
  echo -e "${GREEN}✅ Puppeteer installed!${NC}"
  echo "Available: Puppeteer, Stealth, Ghost Cursor, User Agents"
}

install_cloud() {
  echo -e "${YELLOW}⚠️  Installing 30+ AWS SDK clients (~800MB)...${NC}"
  read -p "Are you sure? (y/N) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    pnpm run install:dev:cloud
    echo -e "${GREEN}✅ Cloud inventory dependencies installed!${NC}"
    echo "Available: EC2, ECS, Lambda, RDS, S3, CloudWatch, etc."
  else
    echo "Cancelled."
  fi
}

print_header

# Check if pnpm is installed
if ! command -v pnpm &> /dev/null; then
  echo -e "${RED}❌ pnpm not found. Please install it first:${NC}"
  echo "   npm install -g pnpm"
  exit 1
fi

# Interactive mode if no arguments
if [ $# -eq 0 ]; then
  while true; do
    print_menu
    read -p "Enter your choice: " choice
    echo ""

    case $choice in
      1) install_minimal; break ;;
      2) install_common; break ;;
      3) install_full; break ;;
      4) install_replicators; break ;;
      5) install_plugins; break ;;
      6) install_puppeteer; break ;;
      7) install_cloud; break ;;
      0) echo "Goodbye!"; exit 0 ;;
      *) echo -e "${RED}Invalid choice. Please try again.${NC}\n" ;;
    esac
  done
else
  # Command-line mode
  case $1 in
    minimal) install_minimal ;;
    common) install_common ;;
    full) install_full ;;
    replicators) install_replicators ;;
    plugins) install_plugins ;;
    puppeteer) install_puppeteer ;;
    cloud) install_cloud ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      echo "Usage: $0 [minimal|common|full|replicators|plugins|puppeteer|cloud]"
      exit 1
      ;;
  esac
fi

echo ""
echo -e "${CYAN}Next steps:${NC}"
echo "  • Run tests: pnpm test"
echo "  • Build: pnpm run build"
echo "  • See DEVELOPMENT.md for more info"
echo ""
