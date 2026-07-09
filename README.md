# CyberCat

<p align="center">
	<img src="./brand/CyberCat.png" width="180" alt="CyberCat avatar" />
</p>

<p align="center">
	<img src="./brand/CyberCat4Text.png" width="220" alt="CyberCat wordmark" />
</p>

CyberCat is a small Nx workspace with:

- a Fastify service that discovers runnable script commands and streams output over Server-Sent Events
- a React web app that lets you filter, run, and watch those commands in a terminal-style UI
- a global shortcut selection assistant that can capture selected text, call an OpenAI-compatible chat endpoint, stream the result into the web UI, and append a local JSONL log
- colocated command entrypoints under [commands](./commands) and a local `.env` file in the `CyberCat` root

## Structure

- [apps/service](./apps/service) contains the Fastify API and command execution backend
- [apps/web](./apps/web) contains the React UI and web assets
- [commands/xgd](./commands/xgd) contains the xgd test scripts
- [commands/zixiCat](./commands/zixiCat) contains the zixiCat helper scripts

## Development

Create a local environment file from [`.env.example`](./.env.example) and add your credentials before running the xgd commands.

Start the service:

```sh
npx nx serve @cyber-cat/service
```

Start the web app:

```sh
npx nx serve @cyber-cat/web
```

Build both apps:

```sh
npx nx build @cyber-cat/service
npx nx build @cyber-cat/web
```

## Selection Assistant

The selection assistant is disabled by default. When enabled, it listens for a global shortcut, reads the current Windows selection, sends it to an OpenAI-compatible `/chat/completions` endpoint, shows the result in the web UI, and appends each result to a local JSONL log.

Configure it in [`.env.example`](./.env.example) through these variables:

- `SELECTION_ASSISTANT_ENABLED` to turn the plugin on
- `SELECTION_ASSISTANT_SHORTCUT` to change the global shortcut
- `SELECTION_ASSISTANT_API_KEY`, `SELECTION_ASSISTANT_BASE_URL`, and `SELECTION_ASSISTANT_MODEL` for the LLM endpoint
- `SELECTION_ASSISTANT_PROMPT_PATH` to point at a prompt reference file such as [z.md](./z.md)
- `SELECTION_ASSISTANT_LOG_PATH` to choose the local JSONL log destination

## Commands

CyberCat discovers shell scripts directly from [commands/xgd](./commands/xgd) and [commands/zixiCat](./commands/zixiCat). They run from the repository root:

```sh
bash ./commands/xgd/qwen-chat-llm-test.bash
bash ./commands/xgd/qwen-embed-test.bash
bash ./commands/xgd/qwen-rerank-test.bash
bash ./commands/zixiCat/copy-command2run-remote-bashrc.bash
```
