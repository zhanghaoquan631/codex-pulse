import {spawnSync} from 'node:child_process';
for (const cwd of ['.','apps/main','apps/account','apps/gallery']) {
 const command=process.platform==='win32'?'npm.cmd':'npm';
 const result=spawnSync(command,['ci','--include=dev','--include=optional','--no-audit','--no-fund'],{cwd,stdio:'inherit',shell:process.platform==='win32'});
 if(result.status!==0) process.exit(result.status||1);
}
