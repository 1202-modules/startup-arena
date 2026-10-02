import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { createApp } from '../dist/app.js';
import { openDatabase } from '../dist/db/database.js';
import { ensureCurrentEvent, finalizeCurrentEvent, getPublicEvent } from '../dist/events/event-store.js';
import { createSession, confirmRound, advanceSession, completeSession } from '../dist/sessions/session-store.js';

async function withApp(callback) {
  const directory=mkdtempSync(join(tmpdir(),'startup-organizer-test-'));
  const database=openDatabase(join(directory,'source.sqlite'));
  assert.equal(database.pragma('journal_mode',{simple:true}),'wal');
  const password=randomBytes(24).toString('hex');
  ensureCurrentEvent(database);
  const server=createApp(database,password).listen(0,'127.0.0.1');
  await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  const request=(path,method='GET',body,token)=>fetch(origin+path,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
  try { await callback({database,password,request,directory}); }
  finally {await new Promise(resolve=>server.close(resolve));database.close();rmSync(directory,{recursive:true,force:true});}
}

test('organizer requires authentication, validates titles and creates an event atomically', ()=>withApp(async({database,password,request})=>{
  for(const path of ['/api/organizer','/api/organizer/ranking.csv','/api/organizer/backup.sqlite']) assert.equal((await request(path)).status,401);
  assert.equal((await request('/api/organizer/login','POST',{password:'invalid'})).status,401);
  const login=await (await request('/api/organizer/login','POST',{password})).json();
  assert.equal(login.expiresInSeconds,900);
  const token=login.token;
  assert.equal((await request('/api/organizer/event','PATCH',{title:'Q'},token)).status,400);
  assert.equal((await request('/api/organizer/event','PATCH',{title:'Synthetic Event'},token)).status,200);
  assert.equal(getPublicEvent(database).title,'Synthetic Event');
  assert.equal((await request('/api/organizer/event/new','POST',{title:'Another'},token)).status,409);
  const active=createSession(database,{name:'QA Synthetic',language:'en'});
  assert.equal((await request('/api/event/finalize','POST',{password})).status,409);
  let session=active;
  for(let q=1;q<=3;q++){session=confirmRound(database,session.id,String(q));session=q===3?completeSession(database,session.id):advanceSession(database,session.id);}
  assert.equal((await request('/api/event/finalize','POST',{password:'invalid'})).status,401);
  assert.equal((await request('/api/event/finalize','POST',{password})).status,200);
  const oldKey=getPublicEvent(database).eventKey;
  assert.equal((await request('/api/organizer/event/new','POST',{title:'Q'},token)).status,400);
  assert.equal(getPublicEvent(database).eventKey,oldKey);
  assert.equal(database.prepare('SELECT COUNT(*) n FROM events').get().n,1);
  assert.equal((await request('/api/organizer/event/new','POST',{title:'Next Synthetic'},token)).status,201);
  assert.notEqual(getPublicEvent(database).eventKey,oldKey);
  assert.equal(getPublicEvent(database).completedCount,0);
  assert.equal(database.prepare('SELECT COUNT(*) n FROM participants').get().n,1);
  assert.equal(database.prepare('SELECT model_version FROM events WHERE id=?').get(getPublicEvent(database).eventKey).model_version,2);
  assert.equal((await request('/api/sessions','POST',{name:'Fresh QA',language:'en'})).status,201);
}));

test('CSV neutralizes formulas, preserves cents; SQLite backup is a consistent authenticated snapshot', ()=>withApp(async({database,password,request,directory})=>{
  const event=ensureCurrentEvent(database);
  database.prepare(`INSERT INTO participants(id,event_id,name,name_key,language,status,current_round,current_capital_cents,current_cash_cents,started_at,finished_at,final_capital_cents) VALUES ('csv-qa',?,'=QA("x")','=qa','en','COMPLETED',3,125437,0,'2026-10-01','2026-10-01',125437)`).run(event.id);
  const {token}=await (await request('/api/organizer/login','POST',{password})).json();
  assert.equal((await request('/api/organizer/downloads','POST',{type:'ranking.csv'})).status,401);
  assert.equal((await request('/api/organizer/downloads','POST',{type:'unknown'},token)).status,400);
  const ticket=await (await request('/api/organizer/downloads','POST',{type:'ranking.csv'},token)).json();
  assert.ok(!ticket.path.includes(token));
  assert.equal((await request(ticket.path)).status,200);
  assert.equal((await request(ticket.path)).status,401);
  const expiring=await (await request('/api/organizer/downloads','POST',{type:'backup.sqlite'},token)).json();
  const realNow=Date.now;
  try {Date.now=()=>realNow()+60001;assert.equal((await request(expiring.path)).status,401);} finally {Date.now=realNow;}
  const csv=await request('/api/organizer/ranking.csv','GET',undefined,token);
  assert.equal(csv.status,200);assert.match(csv.headers.get('content-disposition'),/ranking.csv/);
  assert.match(await csv.text(), /1,"'=QA\(""x""\)",1254\.37/);
  const backupResponse=await request('/api/organizer/backup.sqlite','GET',undefined,token);
  const snapshot=Buffer.from(await backupResponse.arrayBuffer());
  assert.equal(snapshot[18],1); assert.equal(snapshot[19],1);
  const backup=new Database(snapshot);
  try {
    assert.equal(backup.pragma('integrity_check',{simple:true}),'ok');
    assert.deepEqual(getPublicEvent(backup),getPublicEvent(database));
    assert.equal(backup.pragma('user_version',{simple:true}),4);
  } finally {backup.close();}
  const backupPath=join(directory,'standalone.sqlite');
  writeFileSync(backupPath,snapshot);
  const fileBackup=new Database(backupPath,{readonly:true});
  try {assert.equal(fileBackup.pragma('integrity_check',{simple:true}),'ok');assert.deepEqual(getPublicEvent(fileBackup),getPublicEvent(database));} finally {fileBackup.close();}
  assert.equal(database.pragma('journal_mode',{simple:true}),'wal');
  const overview=await (await request('/api/organizer','GET',undefined,token)).json();
  assert.equal(JSON.stringify(overview).includes('scenario-'),false);
  assert.equal(JSON.stringify(overview).includes('portfolio'),false);
}));
