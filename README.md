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

## Commands

CyberCat discovers shell scripts directly from [commands/xgd](./commands/xgd) and [commands/zixiCat](./commands/zixiCat). They run from the repository root:

```sh
bash ./commands/xgd/qwen-chat-llm-test.bash
bash ./commands/xgd/qwen-embed-test.bash
bash ./commands/xgd/qwen-rerank-test.bash
bash ./commands/zixiCat/copy-command2run-remote-bashrc.bash
```
