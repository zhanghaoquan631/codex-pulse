import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';

test('Jianying migration tolerates an initialized table while preserving devices and unique credentials',()=>{
  const db=new DatabaseSync(':memory:');
  try{
    const migration=readFileSync(new URL('../drizzle/0003_solid_fixer.sql',import.meta.url),'utf8');
    db.exec(migration);
    db.prepare('INSERT INTO jianying_devices(id,name,pair_hash,token_hash,created_at) VALUES (?,?,?,?,?)').run('existing','我的剪映电脑','pair','token',123);
    const before=db.prepare('SELECT * FROM jianying_devices').get();
    db.exec(migration);
    assert.deepEqual(db.prepare('SELECT * FROM jianying_devices').get(),before);
    assert.throws(()=>db.prepare('INSERT INTO jianying_devices(id,name,pair_hash,created_at) VALUES (?,?,?,?)').run('duplicate','x','pair',124),/UNIQUE/);
    assert.throws(()=>db.prepare('INSERT INTO jianying_devices(id,name,token_hash,created_at) VALUES (?,?,?,?)').run('duplicate','x','token',124),/UNIQUE/);
  }finally{db.close();}
});
