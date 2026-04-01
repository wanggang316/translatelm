# translatelm

Astro 静态站点，已配置为通过 GitHub Actions 自动发布到 GitHub Pages。

## 本地开发

```sh
npm install
npm run dev
```

## 发布到 GitHub Pages

1. 将仓库推送到 GitHub。
2. 在 GitHub 仓库中打开 `Settings > Pages`。
3. 在 `Build and deployment` 下将 `Source` 设为 `GitHub Actions`。
4. 推送到 `main` 分支，或在 `Actions` 页面手动运行 `Deploy to GitHub Pages`。

工作流文件位于 `.github/workflows/deploy.yml`，会自动：

- 安装依赖
- 构建 Astro 站点
- 上传 `dist/`
- 部署到 GitHub Pages

## 路径说明

构建时会根据 GitHub 仓库名自动设置 Astro 的 `base`，因此项目页地址会是：

```text
https://<GitHub 用户名>.github.io/<仓库名>/
```

本地开发仍然使用根路径 `/`，不需要额外切换配置。
