import { database } from '@/db/raw';
import { emptyCompassDay, type CompassDay, type CompassEntry, type CompassState, type CompassTask } from './compass-types';

export async function readCompass(scope: string, date: string): Promise<CompassState> {
  const db=database();
  const [day, entries, tasks]=await Promise.all([
    db.prepare('SELECT habits,scores,version FROM compass_days WHERE scope=? AND date=?').bind(scope,date).first<{habits:string;scores:string;version:number}>(),
    db.prepare('SELECT id,date,kind,text,created FROM compass_entries WHERE scope=? AND date=? ORDER BY created DESC,id DESC LIMIT 500').bind(scope,date).all<CompassEntry>(),
    db.prepare('SELECT id,text,due,done,version FROM compass_tasks WHERE scope=? ORDER BY done ASC,created DESC,id DESC LIMIT 500').bind(scope).all<Omit<CompassTask,'done'>&{done:number}>(),
  ]);
  return { date, day:day ? {habits:JSON.parse(day.habits),scores:JSON.parse(day.scores),version:day.version} : emptyCompassDay(), entries:entries.results, tasks:tasks.results.map(t=>({...t,done:!!t.done})) };
}
export async function saveCompassDay(scope:string,date:string,day:CompassDay,version:number) {
  const db=database(),habits=JSON.stringify(day.habits),scores=JSON.stringify(day.scores);
  const result=version===0
    ? await db.prepare('INSERT INTO compass_days(scope,date,habits,scores,version) VALUES(?,?,?,?,1) ON CONFLICT(scope,date) DO NOTHING').bind(scope,date,habits,scores).run()
    : await db.prepare('UPDATE compass_days SET habits=?,scores=?,version=version+1 WHERE scope=? AND date=? AND version=?').bind(habits,scores,scope,date,version).run();
  return result.meta.changes===1;
}
