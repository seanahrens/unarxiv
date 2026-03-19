#!/usr/bin/env bash
# Start the full local dev environment (worker API + frontend).
#
# Usage:
#   ./dev.sh          — start both services
#   ./dev.sh setup    — first-time setup: install deps, init DB, seed data, copy env files
#   ./dev.sh seed     — re-seed the local database
#   ./dev.sh reset    — wipe local DB and re-seed from scratch
#
# The worker runs on http://localhost:8787
# The frontend runs on http://localhost:3000

set -euo pipefail
cd "$(dirname "$0")"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ensure_env_files() {
  if [ ! -f frontend/.env.local ]; then
    echo -e "${YELLOW}Creating frontend/.env.local from example...${NC}"
    cp frontend/.env.local.example frontend/.env.local
  fi
  if [ ! -f worker/.dev.vars ]; then
    echo -e "${YELLOW}Creating worker/.dev.vars from example...${NC}"
    cp worker/.dev.vars.example worker/.dev.vars
  fi
}

case "${1:-run}" in
  setup)
    echo -e "${GREEN}=== First-time local dev setup ===${NC}"
    ensure_env_files

    echo -e "\n${GREEN}Installing worker dependencies...${NC}"
    (cd worker && npm install)

    echo -e "\n${GREEN}Installing frontend dependencies...${NC}"
    (cd frontend && npm install)

    echo -e "\n${GREEN}Initializing local D1 database...${NC}"
    (cd worker && npm run db:init)

    echo -e "\n${GREEN}Seeding local database...${NC}"
    (cd worker && npm run db:seed)

    echo -e "\n${GREEN}=== Setup complete! ===${NC}"
    echo -e "Run ${YELLOW}./dev.sh${NC} to start the dev environment."
    echo -e "  Worker API: http://localhost:8787"
    echo -e "  Frontend:   http://localhost:3000"
    echo -e "  Admin password: ${YELLOW}localdev${NC}"
    ;;

  seed)
    echo -e "${GREEN}Seeding local database...${NC}"
    (cd worker && npm run db:seed)
    echo -e "${GREEN}Done.${NC}"
    ;;

  reset)
    echo -e "${YELLOW}Resetting local database...${NC}"
    (cd worker && npm run db:reset)
    echo -e "${GREEN}Done.${NC}"
    ;;

  run)
    ensure_env_files

    # Check if deps are installed
    if [ ! -d worker/node_modules ]; then
      echo -e "${RED}Worker dependencies not installed. Run: ./dev.sh setup${NC}"
      exit 1
    fi
    if [ ! -d frontend/node_modules ]; then
      echo -e "${RED}Frontend dependencies not installed. Run: ./dev.sh setup${NC}"
      exit 1
    fi

    # Check if local DB exists
    if [ ! -d worker/.wrangler/state ]; then
      echo -e "${YELLOW}No local database found. Initializing and seeding...${NC}"
      (cd worker && npm run db:init && npm run db:seed)
    fi

    echo -e "${GREEN}Starting local dev environment...${NC}"
    echo -e "  Worker API: http://localhost:8787"
    echo -e "  Frontend:   http://localhost:3000"
    echo -e "  Admin password: localdev"
    echo -e ""
    echo -e "  ${YELLOW}Tip:${NC} Simulate narration completion with:"
    echo -e "  curl -X POST http://localhost:8787/api/webhooks/modal \\"
    echo -e "    -H 'Content-Type: application/json' \\"
    echo -e "    -d '{\"arxiv_id\":\"PAPER_ID\",\"status\":\"complete\",\"duration_seconds\":600}'"
    echo -e ""

    # Start both in parallel, kill both on Ctrl-C
    trap 'kill 0' EXIT
    (cd worker && npm run dev) &
    (cd frontend && npm run dev) &
    wait
    ;;

  *)
    echo "Usage: ./dev.sh [setup|seed|reset|run]"
    exit 1
    ;;
esac
