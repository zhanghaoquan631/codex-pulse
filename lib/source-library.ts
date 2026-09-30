import catalog from './feature-source-catalog.json';
import { sourceProjects as mapProjects } from './map-source-library';
export const sourceRepository = 'https://github.com/zhanghaoquan631/codex-pulse';
export type SourceProjectId = string;
export type SourceProject = { title: string; path: string; prompt: string; bundle: string; release: string; note: string };
type CatalogItem = { id: string; title: string; requirements: string; path?: string };
const paths: Record<string,string> = {tokens:'app/dashboard.tsx',websites:'app/websites.tsx',betteropc:'app/betteropc-center.tsx','mezip-local':'standalone/mezip-local',knowledge:'standalone/library',bookshelf:'standalone/bookshelf',mezip:'standalone/mezip',finance:'standalone/mezip-local/services/finance-mobile-bridge',shop:'standalone/shop',github:'standalone/mezip-local/services/github-workspace',media:'standalone/mezip-local/apps/web',music:'app/music-center.tsx',booking:'app/booking-center.tsx',qduo:'integration/qduo-windows',core:'app'};
export const sourceProjects: Record<string,SourceProject> = Object.fromEntries(Object.entries(mapProjects).map(([id,item])=>[id,{...item,bundle:id,release:'source-v1.0.0',note:'提示词按现有功能整理；源码按文件分段，资源与地理数据请下载源码包。'}]));
for (const section of catalog.sections) {
  for (const item of section.items as CatalogItem[]) {
    const map = sourceProjects[section.bundle];
    const scope = section.id === 'betteropc' ? '源码包含本站的外站接入模块；BetterOPC 的服务器由第三方运营。' : '源码包含该功能所在模块及共享代码；独立服务需按随包说明配置。';
    sourceProjects[item.id] = {
      title: section.title + ' · ' + item.title,
      bundle: section.bundle, path: item.path ?? map?.path ?? paths[section.bundle] ?? 'docs/development.md',
      release: map?.release ?? catalog.release, note: scope,
      prompt: '请实现“'+section.title+'”中的“'+item.title+'”功能，交付可编辑源码和运行说明。\n\n功能要求：'+item.requirements+'。\n\n沿用 Codex Pulse 的 React / TypeScript 工作台和该模块已有的独立服务边界；明确前端、API、数据存储、本机桥接和外部依赖。根据随附源码保留已有操作、错误处理与手机适配，不使用写死成功结果代替真实调用。\n个人数据与配置保持用户隔离，公开源码只放示例配置。凭据由部署者提供，禁止将作者的运行数据库、Cookie 或本机路径打包。需要屏幕、麦克风、文件或本机权限时由用户主动授权；变更数据时校验身份并处理重复请求。\n'+scope+'\n提供必要的数据库结构、接口、安装命令、失败与恢复说明。验证主要操作、断线、空状态、权限拒绝和手机布局。保留第三方许可与来源；此提示词根据现有功能整理，不宣称是原始对话的逐字记录。',
    };
  }
}
