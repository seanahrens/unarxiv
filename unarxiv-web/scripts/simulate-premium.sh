#!/bin/bash
# Simulate a premium narration completion webhook for local testing.
# Usage: ./scripts/simulate-premium.sh [PAPER_ID] [PROVIDER]
#   PAPER_ID defaults to 2301.07041
#   PROVIDER defaults to elevenlabs (options: elevenlabs, openai)

set -e

PAPER_ID="${1:-2301.07041}"
PROVIDER="${2:-elevenlabs}"
WORKER_URL="${WORKER_URL:-http://localhost:8787}"
WEBHOOK_SECRET="${WEBHOOK_SECRET:-dev-secret-change-me}"

VERSION_KEY="audio/${PAPER_ID}/premium-${PROVIDER}.mp3"

# Copy the test audio fixture to simulate the premium version in local R2
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
R2_DIR="${SCRIPT_DIR}/../worker/.wrangler/state/r2/unarxiv-audio"
mkdir -p "${R2_DIR}/audio/${PAPER_ID}"
cp "${SCRIPT_DIR}/../fixtures/silence.mp3" "${R2_DIR}/${VERSION_KEY}"
echo "Copied test audio to ${R2_DIR}/${VERSION_KEY}"

# Set provider-specific fields
if [ "$PROVIDER" = "elevenlabs" ]; then
  TTS_MODEL="eleven_multilingual_v2"
elif [ "$PROVIDER" = "openai" ]; then
  TTS_MODEL="tts-1-hd"
else
  echo "Unknown provider: $PROVIDER (use elevenlabs or openai)"
  exit 1
fi

# Send the webhook
echo "Sending premium completion webhook for ${PAPER_ID} (${PROVIDER})..."
curl -s -X POST "${WORKER_URL}/api/webhooks/modal" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${WEBHOOK_SECRET}" \
  -d "{
    \"arxiv_id\": \"${PAPER_ID}\",
    \"status\": \"narrated\",
    \"audio_r2_key\": \"${VERSION_KEY}\",
    \"duration_seconds\": 600,
    \"eta_seconds\": 0,
    \"version_type\": \"premium\",
    \"script_type\": \"premium\",
    \"tts_provider\": \"${PROVIDER}\",
    \"tts_model\": \"${TTS_MODEL}\",
    \"llm_provider\": \"openai\",
    \"llm_model\": \"gpt-4o\",
    \"actual_cost\": 0.55,
    \"llm_cost\": 0.05,
    \"tts_cost\": 0.50
  }" | python3 -m json.tool 2>/dev/null || echo ""

echo "Done. Reload the paper page to see the enhanced indicator."
