SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CYBERCAT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

source "$CYBERCAT_ROOT/.env"

curl -X POST "${XGD_LLM_BASE_URL}/v1/chat/completions" \
  -H "Authorization: Bearer ${XGD_LLM_API_KEY}" \
  -d '{
    "model": "qwen3.5",
    "messages": [{"role": "user", "content": "What model are you using"}]
  }'