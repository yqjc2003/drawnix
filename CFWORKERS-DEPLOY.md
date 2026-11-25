# Cloudflare Workers 部署

本项目使用 Workers Static Assets 部署静态前端。`wrangler.jsonc` 指定 Worker 名称为 `draw`，构建目录为 `dist/apps/web`，并为单页应用启用路由回退。

## 自动部署

Cloudflare Workers Builds 已连接 GitHub 仓库 `yqjc2003/drawnix` 的 `develop` 分支。提交并推送到该分支后，Cloudflare 会执行 `npm run build:web` 和 `npx wrangler deploy`，将成功的构建发布到生产环境。本地提交不会触发部署。构建环境使用 Node.js 24.21.0；预览构建已关闭。

该流程不会自动执行数据库迁移。如果更新包含 D1 结构变更，需要先按下方命令应用迁移，再推送依赖该结构的代码。

```bash
npm ci
npx wrangler login
npm run deploy:workers
```

正式地址为 https://draw.yqjc2003.workers.dev。访客可使用本地白板；Cloudflare Access 应用保护 `/api/private/*` 云端接口。预览 URL 在配置中关闭。

画布数据存储在独立的 D1 数据库 `drawnix` 中。首次部署或新增迁移时，先执行：

```bash
npx wrangler d1 migrations apply drawnix --remote
```

API 验证 Cloudflare Access 的 JWT，并按用户身份隔离画布。应用与 Access 的团队域名和 Audience 配置位于 `wrangler.jsonc`；若重建 Access 应用，需更新 Audience。云端画布使用手动保存；浏览器中的本地画布可在列表中导入，原本地数据保留。
