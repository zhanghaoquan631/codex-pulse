import { readFile, mkdir, writeFile, realpath, lstat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.resolve(here, '../../public/local-apps');
export const githubFiles = ['github-workspace-v6/index.html','github-workspace-v1/styles.css','github-workspace-v1/app.js','github-workspace-v4/auto-sync.js','github-workspace-v4/enhancements.js','github-workspace-v5/workspace.css','github-workspace-v5/resilient-bridge.js','github-workspace-v5/dashboard-overview.js','github-workspace-v5/pull-requests-view.js','github-workspace-v6/workspace.css','github-workspace-v6/connection-bridge.js','github-workspace-v6/feature-controls.js','github-workspace-v6/workspace-controls.js','github-workspace-v6/heatmap-time.js','github-workspace-v6/route-guard.js'];
const words = [['GITHUB WORKSPACE','开发工作台'],['READ-ONLY GITHUB DATA','来自 GitHub 的真实数据'],['Recent Commits','最近提交'],['Pull Requests','合并请求'],['Pull Request','合并请求'],["issues: 'Issues'","issues: '问题与需求'"],["'orange', 'Issues'","'orange', '问题与需求'"],['>Commits<','>提交<'],['>Open<','>进行中<'],['>Closed<','>已关闭<'],['>Merged<','>已合并<'],['Issues &amp; PR','问题与合并请求'],['<option>Name</option>','<option value="Name">名称</option>'],['<option>Stars</option>','<option value="Stars">星标</option>'],['<option>Forked</option>','<option value="Forked">派生仓库</option>']];
async function save(relative, text) {
  const target = path.join(output, relative), directory = path.dirname(target);
  // Check existing ancestors before mkdir: a redirected output directory must
  // never create folders inside the original application's source tree.
  let existing = directory;
  for (;;) {
    try {
      if ((await realpath(existing)).toLowerCase() !== existing.toLowerCase()) throw new Error('Refusing redirected output');
      break;
    } catch (error) { if (error.code !== 'ENOENT') throw error; existing = path.dirname(existing); }
  }
  await mkdir(directory, { recursive: true });
  if ((await realpath(directory)).toLowerCase() !== directory.toLowerCase()) throw new Error('Refusing redirected output');
  const info = await lstat(target).catch(e => { if (e.code !== 'ENOENT') throw e; });
  if (info && !info.isFile()) throw new Error('Refusing non-regular output');
  await writeFile(target, text);
}
export function transformGithubSource(file, original) {
  let text = original;
  // Labels may change, but V6's filter controls compare these original values.
  if (!file.endsWith('.css')) for (const [value, label] of [['All','全部'],['Open','进行中'],['Closed','已关闭'],['In Progress','处理中']])
    text = text.replaceAll(`<option>${value}</option>`, `<option value="${value}">${label}</option>`);
  if (!file.endsWith('.css')) for (const [from, to] of words) text = text.replaceAll(from, to);
  text = text.replace(/(?<![\w/:])\/github-workspace-v([1456])\//g, '/local-apps/github-workspace-v$1/');
  if (file.endsWith('.html')) {
    text = text.replace('</head>', '<link rel="stylesheet" href="/local-apps/github-theme.css"></head>');
    text = text.replace(/<script src="([^"]+)"\s*>/g, '<script type="text/pulse-deferred" data-src="$1">');
    text = text.replace('</body>', '<script src="/local-apps/github-adapter.js"></script></body>');
  }
  return text;
}
export async function buildGithub(sourceDirectory) {
  if (!sourceDirectory) throw new Error('Pass the original ME.zip public directory as a read-only source');
  const source = await realpath(sourceDirectory);
  if (source.toLowerCase() === output.toLowerCase() || source.toLowerCase().startsWith(output.toLowerCase() + path.sep)) throw new Error('Original source must be separate from the hosted output');
  for (const file of githubFiles) await save(file, transformGithubSource(file, await readFile(path.join(source, file), 'utf8')));
  for (const asset of ['github-adapter.js', 'github-theme.css']) await save(asset, await readFile(path.join(here, asset), 'utf8'));
  return { files: githubFiles.length + 2, sourceMode: 'read-only', output };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await buildGithub(process.argv[2])));
