SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CYBERCAT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

source "$CYBERCAT_ROOT/.env"

curl -X POST "${XGD_LLM_BASE_URL}/rerank" \
  -H "Authorization: Bearer ${XGD_LLM_API_KEY}" \
  -d '{
    "model": "qwen-rerank",
    "query": "What is machine learning?",
    "documents": [
      "Machine learning is a subset of AI.",
      "Python is a programming language.",
      "Deep learning uses neural networks."
    ]
  }'