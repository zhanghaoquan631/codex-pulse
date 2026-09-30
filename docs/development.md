# 开发说明

## 工作台

根目录使用 React / Vinext，开发服务器通过 Cloudflare 本地模拟器提供 Workers / D1。干净克隆默认为 portable 模式，不需要作者的电脑环境。

```bash
npm run install:ci
npm run dev
npm run build
```

地图和小游戏是静态浏览器内容。统计、预约等模块需要初始化数据库与配置服务；发布需要自己的 Workers / D1 或 Sites 实例。公开仓库的 `.openai/hosting.json` 只保留绑定名称，不绑定作者的线上项目。示例账号不能获得原站管理权限。

D1 结构与迁移见 `db/` 和 `drizzle/`。生产部署需要应用迁移并设置自己的鉴权和写入凭据。原部署详细记录保留在 [operations.md](operations.md)；其中“已配置”描述原实例，不代表新克隆已完成配置。

## 独立地图

```bash
cd examples/chaoshan-3d-map
npm ci
npm run dev
```

厦门示例改为 `examples/xiamen-3d-map`。两者均支持 `npm run build`。地理快照包含在 `public/data/`；重新生成数据可能需要脚本的外部输入，见目录说明。

## 独立游戏

从仓库根目录运行 `python -m http.server 8080`，打开：

- 潮汕行旅：`http://localhost:8080/public/local-apps/chaoshan-atlas/adventure/`
- 公鸡快跑：`http://localhost:8080/public/games/rooster-rush/`
- 浙大校园漫游：`http://localhost:8080/examples/zju-overworld/`

游戏使用浏览器存储保存进度。可选动物精灵依赖外部提供方；公开包使用通用动物预览占位图。受限角色模型不随仓库分发。

## 本机采集器（可选）

需要 Node.js 24.5+。新克隆没有自动启动项或同步授权；先阅读 `collector/README.md` 与代码。

在被 Git 忽略的 `collector/config.json` 中填写自己的部署地址和凭据：

```json
{
  "siteUrl": "https://your-own-site.example",
  "ingestToken": "YOUR_OWN_INGEST_TOKEN",
  "sitesToken": "YOUR_OWN_SITES_TOKEN"
}
```

占位值不能直接使用。运行前需部署自己的服务端并配置写入鉴权。不要提交配置、`collector/data/`、Cookie 或数据库。账本、邮件、商店和本机工具也需分别配置服务。

## 更新源码下载

运行 `python scripts/prepare-source-library.py`，生成 `public/source-library/*.txt` 和被忽略的 `work/source-packages/*.zip`。将 ZIP 上传到对应 GitHub Release，更新 `app/source-actions.tsx` 的 Release 版本路径。

`python scripts/export-github.py <新的空目录>` 生成移除原站绑定、个人示例值及受限素材的公开快照；不覆盖已有项目。
