import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import {applyMigrations} from '../dist/db/migrations.js';
import {getPublicEvent} from '../dist/events/event-store.js';
import {advanceSession,completeSession,confirmRound,getSession,updatePortfolio} from '../dist/sessions/session-store.js';

test('saved v2 schema with an unfinished v1 market migrates and finishes without repricing',()=>{
 const db=new Database(':memory:');
 try {
  db.exec(`
  CREATE TABLE events(id TEXT PRIMARY KEY,status TEXT,scenario_id TEXT,created_at TEXT,finalized_at TEXT);
  CREATE TABLE participants(id TEXT PRIMARY KEY,event_id TEXT,name TEXT,name_key TEXT,language TEXT,status TEXT,current_round INTEGER,current_capital_cents INTEGER,current_cash_cents INTEGER,started_at TEXT,finished_at TEXT,final_capital_cents INTEGER);
  CREATE TABLE portfolios(id TEXT PRIMARY KEY,participant_id TEXT,round_no INTEGER,novamind_cents INTEGER,medflow_cents INTEGER,voltx_cents INTEGER,greenbox_cents INTEGER,cash_cents INTEGER,confirmed INTEGER,created_at TEXT,updated_at TEXT,UNIQUE(participant_id,round_no));
  CREATE TABLE round_results(id TEXT PRIMARY KEY,participant_id TEXT,round_no INTEGER,capital_before_cents INTEGER,capital_after_cents INTEGER,profit_cents INTEGER,novamind_return_bps INTEGER,medflow_return_bps INTEGER,voltx_return_bps INTEGER,greenbox_return_bps INTEGER,created_at TEXT,UNIQUE(participant_id,round_no));
  INSERT INTO events VALUES('legacy-event','OPEN','scenario-01','2026-09-29',NULL);
  INSERT INTO participants VALUES('legacy-active','legacy-event','QA Legacy','qa legacy','en','IN_PROGRESS',2,114000,0,'2026-09-29',NULL,NULL);
  INSERT INTO participants VALUES('legacy-done','legacy-event','QA Stored','qa stored','ru','COMPLETED',3,125437,0,'2026-09-29','2026-09-29',125437);
  INSERT INTO portfolios VALUES('p1','legacy-active',1,100000,0,0,0,0,1,'2026-09-29','2026-09-29');
  INSERT INTO portfolios VALUES('p2','legacy-active',2,114000,0,0,0,0,0,'2026-09-29','2026-09-29');
  INSERT INTO round_results VALUES('r1','legacy-active',1,100000,114000,14000,1400,700,-800,500,'2026-09-29');
  PRAGMA user_version=2;
  `);
  applyMigrations(db);applyMigrations(db);
  assert.equal(db.pragma('user_version',{simple:true}),4);
  assert.equal(db.prepare('SELECT model_version FROM events').get().model_version,1);
  assert.equal(getPublicEvent(db).leaderboard[0].finalCapitalCents,125437);
  let session=getSession(db,'legacy-active');
  assert.equal(session.decisionMarket.companies.length,4);
  assert.deepEqual(session.startupIds,['NovaMind','MedFlow','VoltX','GreenBox']);
  assert.equal(session.capitalCents,114000);
  assert.equal(session.roundHistory[0].companies[0].returnBps,1400);
  assert.throws(()=>updatePortfolio(db,session.id,{startupAmountsCents:{NovaMind:113999,MedFlow:0,VoltX:0,GreenBox:0,AgroPulse:1,OrbitLink:0},cashCents:0}));
  session=confirmRound(db,session.id,'2');
  assert.equal(session.capitalCents,137940);
  session=advanceSession(db,session.id);
  session=confirmRound(db,session.id,'3');
  assert.equal(session.capitalCents,84143);
  session=completeSession(db,session.id);
  assert.equal(session.finalCapitalCents,84143);
  assert.equal(session.report.contributors.length,4);
  assert.equal(getPublicEvent(db).leaderboard[0].finalCapitalCents,125437);
 }finally{db.close();}
});
