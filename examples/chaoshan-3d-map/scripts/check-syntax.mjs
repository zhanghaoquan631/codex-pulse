import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const files=[root,path.join(root,'scripts')].flatMap(dir=>fs.readdirSync(dir,{withFileTypes:true}).filter(e=>e.isFile()&&/\.(mjs|js)$/.test(e.name)).map(e=>path.join(dir,e.name)));
for(const file of files){const result=spawnSync(process.execPath,['--check',file],{encoding:'utf8'});if(result.status!==0){process.stderr.write(result.stderr||String(result.error));process.exitCode=1;}}
console.log(`Syntax checked ${files.length} JavaScript modules.`);
