import fs from 'node:fs';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
const output=path.resolve('dist/client/source-library');
const source=path.resolve('public/source-library');
const manifest=JSON.parse(fs.readFileSync(path.join(source,'manifest.json'),'utf8'));
let removed=0,compressed=0;
for(const {id} of manifest){
 if(!/^[a-z0-9-]+$/.test(id))throw Error('Invalid source asset ID');
 const plain=fs.readFileSync(path.join(source,`${id}.txt`));
 const gzip=fs.readFileSync(path.join(output,`${id}.txt.gz`));
 const expanded=gunzipSync(gzip);
 // Git may convert text snapshots to CRLF on Windows; the gzip stays binary.
 // Compare UTF-8 content with only CRLF normalized, retaining every other byte.
 const normalize=(bytes)=>Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'),'utf8');
 if(!expanded.equals(plain)&&!normalize(expanded).equals(normalize(plain)))throw Error('Source compression changed content: '+id);
 const target=path.join(output,`${id}.txt`);
 if(path.dirname(target)!==output)throw Error('Invalid source asset path');
 fs.rmSync(target,{force:true});
 removed+=plain.length;compressed+=gzip.length;
}
console.log(`Source assets verified: ${manifest.length}; ${removed} plain bytes, ${compressed} compressed bytes. GitHub retains the editable plain files.`);
