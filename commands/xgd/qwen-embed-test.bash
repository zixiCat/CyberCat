SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CYBERCAT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

source "$CYBERCAT_ROOT/.env"

curl -X POST "${XGD_LLM_BASE_URL}/v1/embeddings" \
  -H "Authorization: Bearer ${XGD_LLM_API_KEY}" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-embed",
    "input": [
      "What is machine learning?",
      "Machine learning is a subset of AI.",
      "Python is a programming language."
    ]
  }'