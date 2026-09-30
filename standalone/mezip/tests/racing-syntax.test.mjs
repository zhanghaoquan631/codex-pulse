import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Parse as browser ES modules even when the asset folder has no package.json.
// This catches path rewrites that accidentally alter JavaScript regex literals.
test('every shipped racing script parses as a browser module',()=>{
 const root=path.resolve('apps/racing');
 const scripts=fs.readdirSync(root,{recursive:true}).filter(file=>file.endsWith('.js'));
 assert.ok(scripts.length>5);
 for(const file of scripts){
  const result=spawnSync(process.execPath,['--input-type=module','--check'],{input:fs.readFileSync(path.join(root,file),'utf8'),encoding:'utf8'});
  assert.equal(result.status,0,`Invalid browser script: ${file}\n${(result.stderr||'').slice(-1000)}`);
 }
});
