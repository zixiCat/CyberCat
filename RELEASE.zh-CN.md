# 发布流程

这个项目用 [scripts/windows/release.py](scripts/windows/release.py) 作为发布辅助脚本。

## 脚本会做什么

- 同步 `package.json` 里的版本号
- 同步 `apps/chatbot/package.json` 里的版本号
- 同步 `package-lock.json` 里的版本号
- 同步 `pyproject.toml` 里的版本号
- 同步 `installer/CyberCat.iss` 里的版本号
- 可选地构建 bundle 或 Windows 安装包
- 可选地执行 `gh release create`

## 常用命令

- 只同步版本号：`npm run release -- 1.0.0`
- 同步版本号并构建 bundle：`npm run release:bundle -- 1.0.0`
- 同步版本号并构建安装包：`npm run release:win -- 1.0.0`
- 同步版本号、构建安装包并发布：`npm run release:win -- 1.0.0 --publish --generate-notes`

## 自定义发布产物

如果你想上传自定义产物，可以重复传入 `--asset`。

- 上传 zip：`npm run release -- 1.0.0 --publish --generate-notes --asset ./build-artifact.zip`
- 上传多个产物：`npm run release -- 1.0.0 --publish --asset ./a.zip --asset ./b.exe`

如果不传 `--publish`，脚本只会把 `gh release create` 命令打印出来，方便你先检查。

## 直接使用 GitHub CLI 的等价命令

如果你要上传自定义 zip，最终命令等价于：

```bash
gh release create v1.0.0 ./build-artifact.zip --generate-notes
```

## 说明

- 版本号参数支持 `1.0.0` 和 `v1.0.0`
- `release:win` 会走现有的 Windows 打包流程来构建安装包
- `release:bundle` 只构建 PyInstaller bundle