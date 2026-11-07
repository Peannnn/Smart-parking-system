import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const admin='11111111-1111-4111-8111-111111111111', alice='22222222-2222-4222-8222-222222222222',bob='33333333-3333-4333-8333-333333333333',fresh='55555555-5555-4555-8555-555555555555'

test('normal-user onboarding and reservations enforce access and booking windows',async t=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   insert into auth.users values('${admin}','admin@example.com',now()),('${alice}','alice@example.com',now()),('${bob}','bob@example.com',now()),('${fresh}','new@example.com',now());`)
  async function login(id,role='authenticated'){
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`)
  }
  for(const file of ['parking.sql','002_self_service_spots.sql'])await db.exec(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'))
  await login(admin)
  const lot=(await db.query("select parking_create_lot('Existing lot',4) as id")).rows[0].id
  await db.query("select parking_save_vehicle_account($1,'ALC 123','Alice',current_date+30,true,'alice@example.com')",[lot])
  await db.query("select parking_save_vehicle_account($1,'BOB 123','Bob',current_date+30,true,'bob@example.com')",[lot])
  const spots=(await db.query('select * from parking_list_spots($1)',[lot])).rows
  await db.exec('reset role')
  const sql=await readFile(new URL('../supabase/003_user_home_reservations.sql',import.meta.url),'utf8')
  await db.exec(sql);await db.exec(sql)
  const start=new Date(Date.now()+3600000).toISOString(),end=new Date(Date.now()+7200000).toISOString(),later=new Date(Date.now()+10800000).toISOString()
  let booking
  await t.test('new accounts cannot create a lot or make themselves an administrator',async()=>{
   await login(fresh)
   assert.equal((await db.query('select * from parking_lots')).rows.length,0)
   await assert.rejects(db.query("select parking_create_lot('Unauthorized lot',10)"),/Administrator/)
   await assert.rejects(db.query("insert into parking_members values($1,$2,'admin')",[lot,fresh]),/permission denied/)
   await assert.rejects(db.query('select parking_reserve($1,$2,$3,$4,$5)',[lot,'ALC 123',spots[0].id,start,end]),/Parking access/)
   await login(alice)
   await assert.rejects(db.query("select parking_create_lot('Unauthorized lot',10)"),/Administrator/)
   await login(admin)
   assert((await db.query("select parking_create_lot('Another admin lot',2) as id")).rows[0].id)
  })
  await t.test('a driver can reserve only their own permitted vehicle',async()=>{
   await login(alice)
   await assert.rejects(db.query('select parking_reserve($1,$2,$3,$4,$5)',[lot,'BOB 123',spots[0].id,start,end]),/linked to your account/)
   booking=(await db.query('select parking_reserve($1,$2,$3,$4,$5) as id',[lot,'ALC 123',spots[0].id,start,end])).rows[0].id
   assert.equal((await db.query('select * from parking_reservations')).rows[0].user_id,alice)
   await assert.rejects(db.query('select parking_reserve($1,$2,$3,$4,$5)',[lot,'ALC 123',spots[1].id,start,end]),/already has a reservation/)
  })
  await t.test('overlapping bookings are blocked, adjacent bookings are allowed, identities stay private',async()=>{
   await login(bob)
   assert.equal((await db.query('select * from parking_reservations')).rows.length,0)
   const available=(await db.query('select * from parking_reservation_spots($1,$2,$3)',[lot,start,end])).rows
   assert.equal(available.some(s=>s.id===spots[0].id),false)
   assert.equal('user_id' in available[0],false)
   await assert.rejects(db.query('select parking_reserve($1,$2,$3,$4,$5)',[lot,'BOB 123',spots[0].id,start,end]),/already has a reservation/)
   await db.query('select parking_reserve($1,$2,$3,$4,$5)',[lot,'BOB 123',spots[0].id,end,later])
   await assert.rejects(db.query('select parking_cancel_reservation($1)',[booking]),/own unclaimed/)
   await assert.rejects(db.query('update parking_reservations set status=\'cancelled\''),/permission denied/)
  })
  await t.test('walk-ins and old entry endpoints cannot bypass a scheduled spot',async()=>{
   await login(bob)
   await assert.rejects(db.query("select parking_record_entry($1,'BOB 123',$2)",[lot,spots[0].id]),/reservation during your stay/)
   await assert.rejects(db.query("select parking_start_visit($1,'BOB 123',$2,$3)",[lot,spots[0].id,end]),/reservation during your stay/)
   const short=new Date(Date.now()+1800000).toISOString()
   await db.query("select parking_start_visit($1,'BOB 123',$2,$3)",[lot,spots[0].id,short])
   await login(alice)
   const futureSpots=(await db.query('select * from parking_reservation_spots($1,$2,$3)',[lot,end,later])).rows
   assert.equal(futureSpots.some(s=>s.id===spots[0].id),false) // Bob's adjacent reservation.
   await login(bob);await db.query("select parking_check_out($1,'BOB 123')",[lot])
  })
  await t.test('reservations cannot check in early and cannot retire a booked spot',async()=>{
   await login(alice)
   await assert.rejects(db.query("select parking_start_visit($1,'ALC 123',$2,$3,$4)",[lot,spots[0].id,end,booking]),/only during the reservation/)
   await assert.rejects(db.query("select parking_start_visit($1,'ALC 123',$2,null)",[lot,spots[1].id]),/expected departure/)
   await login(bob)
   const high=(await db.query('select parking_reserve($1,$2,$3,$4,$5) as id',[lot,'BOB 123',spots[3].id,start,end])).rows[0].id
   await login(admin)
   await assert.rejects(db.query("select parking_update_lot($1,'Lot',3)",[lot]),/upcoming reservations/)
   await db.query('select parking_cancel_reservation($1)',[high])
  })
  await t.test('active reservations become visits once, with private history and preserved spot IDs',async()=>{
   // Move the fixture into its arrival window, without waiting an hour.
   await db.exec('reset role');await db.query("update parking_reservations set starts_at=now()-interval '1 minute' where id=$1",[booking])
   await login(alice)
   const id=(await db.query("select parking_start_visit($1,'ALC 123',$2,$3,$4) as id",[lot,spots[0].id,end,booking])).rows[0].id
   const row=(await db.query('select * from parking_sessions where id=$1',[id])).rows[0]
   assert.equal(row.reservation_id,booking);assert.equal(row.spot_label,'P-001')
   assert.equal((await db.query('select status from parking_reservations where id=$1',[booking])).rows[0].status,'checked_in')
   await assert.rejects(db.query('select parking_cancel_reservation($1)',[booking]),/unclaimed/)
   await db.query("select parking_check_out($1,'ALC 123')",[lot])
   await assert.rejects(db.query("select parking_start_visit($1,'ALC 123',$2,$3,$4)",[lot,spots[0].id,end,booking]),/does not match/)
   await login(bob)
   assert.equal((await db.query('select * from parking_sessions where id=$1',[id])).rows.length,0)
  })
  await t.test('cancellation releases bookings and invalid dates or expired permits are rejected',async()=>{
   await login(bob)
   const mine=(await db.query("select * from parking_reservations where status='booked'")).rows
   for(const item of mine)await db.query('select parking_cancel_reservation($1)',[item.id])
   await login(alice)
   assert((await db.query('select * from parking_reservation_spots($1,$2,$3)',[lot,start,end])).rows.some(s=>s.id===spots[0].id))
   await assert.rejects(db.query('select parking_reserve($1,$2,$3,$4,$5)',[lot,'ALC 123',spots[0].id,end,start]),/future arrival/)
   await login(admin)
   await db.query("select parking_save_vehicle_account($1,'ALC 123','Alice',current_date-1,true,'alice@example.com')",[lot])
   await login(alice)
   await assert.rejects(db.query('select parking_reserve($1,$2,$3,$4,$5)',[lot,'ALC 123',spots[0].id,start,end]),/valid permit covering/)
   await assert.rejects(db.query("select parking_admit_vehicle($1,'ALC 123',$2,null,null,null)",[lot,spots[0].id]),/permission denied/)
   await login('','anon');await assert.rejects(db.query('select * from parking_reservations'),/permission denied/)
  })
 }finally{await db.close()}
})
