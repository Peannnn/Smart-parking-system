import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const admin='11111111-1111-4111-8111-111111111111',driver='22222222-2222-4222-8222-222222222222',staff='33333333-3333-4333-8333-333333333333'

test('permit checks are read-only and edits replace the targeted record',async t=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   insert into auth.users values('${admin}','admin@example.com',now()),('${driver}','driver@example.com',now()),('${staff}','staff@example.com',now());`)
  async function login(id,role='authenticated'){
   await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`)
  }
  async function install(file){await db.exec(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'))}
  await install('parking.sql');await install('002_self_service_spots.sql');await login(admin)
  const lot=(await db.query("select parking_create_lot('Main lot',3) as id")).rows[0].id
  const otherLot=(await db.query("select parking_create_lot('Other lot',2) as id")).rows[0].id
  await db.query("select parking_add_staff($1,'staff@example.com')",[lot])
  const spot=(await db.query('select * from parking_list_spots($1)',[lot])).rows[0].id
  await db.exec('reset role');await install('003_user_home_reservations.sql');await install('004_permit_checker_edits.sql');await install('004_permit_checker_edits.sql');await login(admin)
  const expires=(await db.query("select (current_date+30)::text as expires")).rows[0].expires
  const today=(await db.query('select current_date::text as today')).rows[0].today
  async function save(id,plate,expiry=expires,active=true,email='driver@example.com',owner='Driver'){
   return (await db.query('select parking_save_permit($1,$2,$3,$4,$5,$6,$7) as id',[lot,id,plate,owner,expiry,active,email])).rows[0].id
  }
  async function check(plate){return (await db.query('select parking_check_permit($1,$2) as result',[lot,plate])).rows[0].result}
  const id=await save(null,'OLD 123')
  await t.test('checker returns valid, expired, inactive and missing without recording a visit',async()=>{
   assert.equal((await check(' old  123 ')).status,'valid')
   await save(id,'OLD 123',today);assert.equal((await check('OLD 123')).status,'valid')
   const past=(await db.query('select (current_date-1)::text as d')).rows[0].d
   await save(id,'OLD 123',past);assert.equal((await check('OLD 123')).status,'expired')
   await save(id,'OLD 123',expires,false);assert.equal((await check('OLD 123')).status,'inactive')
   assert.equal((await check('NONE 123')).status,'not_found')
   assert.equal((await db.query('select * from parking_sessions')).rows.length,0)
   assert.equal((await db.query('select * from parking_reservations')).rows.length,0)
   assert.equal((await db.query('select * from parking_list_spots($1)',[lot])).rows.some(s=>s.occupied),false)
   await save(id,'OLD 123')
  })
  await t.test('changing a plate replaces the same permit ID and removes the old permission',async()=>{
   assert.equal(await save(id,'NEW 123',expires,true,'driver@example.com','Updated owner'),id)
   const rows=(await db.query('select * from parking_vehicles where lot_id=$1',[lot])).rows
   assert.equal(rows.length,1);assert.equal(rows[0].plate,'NEW 123');assert.equal(rows[0].id,id)
   assert.equal(rows[0].owner_name,'Updated owner');assert.equal(rows[0].owner_user_id,driver)
   assert.equal((await check('OLD 123')).status,'not_found');assert.equal((await check('NEW 123')).status,'valid')
   await login(driver)
   await assert.rejects(db.query("select parking_record_entry($1,'OLD 123',$2)",[lot,spot]),/not linked/)
   await login(admin)
  })
  await t.test('invalid edits and duplicate targets roll back instead of creating or deleting permits',async()=>{
   await assert.rejects(save(id,'NEW 123',expires,true,'missing@example.com'),/confirm an account/)
   await assert.rejects(save(null,'NEW 123'),/already exists/)
   const second=await save(null,'OTHER 123',expires,true,'')
   await assert.rejects(save(id,'OTHER 123'),/already exists/)
   await assert.rejects(db.query('select parking_save_permit($1,$2,$3,$4,$5,$6,$7)',[otherLot,id,'LEAK 123','Owner',expires,true,'driver@example.com']),/no longer exists in this lot/)
   assert.equal((await db.query('select * from parking_vehicles where lot_id=$1',[lot])).rows.length,2)
   assert.equal((await check('NEW 123')).status,'valid')
   await db.query('select parking_delete_permit($1,$2)',[lot,second])
  })
  await t.test('parked vehicles must check out before plate edits or deletion, and history remains intact',async()=>{
   await db.query("select parking_record_entry($1,'NEW 123',$2)",[lot,spot])
   await assert.rejects(save(id,'CHANGED 123'),/Check this vehicle out/)
   await assert.rejects(db.query('select parking_delete_permit($1,$2)',[lot,id]),/Check this vehicle out/)
   await save(id,'NEW 123',expires,false) // Status edits can take effect immediately without stranding checkout.
   await login(driver);await db.query("select parking_check_out($1,'NEW 123')",[lot]);await login(admin)
   await save(id,'CHANGED 123')
   const history=(await db.query('select * from parking_sessions')).rows
   assert.equal(history.length,1);assert.equal(history[0].plate,'NEW 123');assert(history[0].exit_at)
   assert.equal((await check('NEW 123')).status,'not_found');assert.equal((await check('CHANGED 123')).status,'valid')
  })
  let booking
  await t.test('old-plate reservations are cancelled atomically when a permit changes',async()=>{
   await login(driver)
   const start=new Date(Date.now()+3600000).toISOString(),end=new Date(Date.now()+7200000).toISOString()
   booking=(await db.query('select parking_reserve($1,$2,$3,$4,$5) as id',[lot,'CHANGED 123',spot,start,end])).rows[0].id
   await login(admin)
   await save(id,'CHANGED 123',expires,true,'driver@example.com','Another owner name')
   assert.equal((await db.query('select status from parking_reservations where id=$1',[booking])).rows[0].status,'booked')
   await save(id,'FINAL 123')
   assert.equal((await db.query('select status from parking_reservations where id=$1',[booking])).rows[0].status,'cancelled')
   assert.equal((await db.query('select * from parking_vehicles where lot_id=$1',[lot])).rows.length,1)
   assert.equal((await check('CHANGED 123')).status,'not_found')
  })
  await t.test('deactivation and shorter expiry cancel only invalidated future bookings',async()=>{
   await login(driver)
   const start=new Date(Date.now()+48*3600000).toISOString(),end=new Date(Date.now()+49*3600000).toISOString()
   const future=(await db.query('select parking_reserve($1,$2,$3,$4,$5) as id',[lot,'FINAL 123',spot,start,end])).rows[0].id
   await login(admin);await save(id,'FINAL 123',expires,false)
   assert.equal((await db.query('select status from parking_reservations where id=$1',[future])).rows[0].status,'cancelled')
   await save(id,'FINAL 123');await login(driver)
   const next=(await db.query('select parking_reserve($1,$2,$3,$4,$5) as id',[lot,'FINAL 123',spot,start,end])).rows[0].id
   await login(admin);await save(id,'FINAL 123',today)
   assert.equal((await db.query('select status from parking_reservations where id=$1',[next])).rows[0].status,'cancelled')
   await save(id,'FINAL 123')
  })
  await t.test('only authorized operators can check and only administrators can edit or delete',async()=>{
   await login(driver)
   await assert.rejects(db.query("select parking_check_permit($1,'FINAL 123')",[lot]),/Staff access/)
   await assert.rejects(save(id,'HACK 123'),/Administrator/)
   await assert.rejects(db.query('select parking_delete_permit($1,$2)',[lot,id]),/Administrator/)
   await login(staff);assert.equal((await check('FINAL 123')).status,'valid')
   await assert.rejects(save(id,'HACK 123'),/Administrator/)
   await assert.rejects(db.query('select parking_delete_permit($1,$2)',[lot,id]),/Administrator/)
   await assert.rejects(db.query("select parking_check_permit($1,'FINAL 123')",[otherLot]),/Staff access/)
   await login('','anon');await assert.rejects(db.query("select parking_check_permit($1,'FINAL 123')",[lot]),/permission denied/)
   await login(admin)
  })
  await t.test('deleting an obsolete permit removes permission while retaining parking history',async()=>{
   await login(driver)
   const start=new Date(Date.now()+3600000).toISOString(),end=new Date(Date.now()+7200000).toISOString()
   const next=(await db.query('select parking_reserve($1,$2,$3,$4,$5) as id',[lot,'FINAL 123',spot,start,end])).rows[0].id
   await login(admin);await db.query('select parking_delete_permit($1,$2)',[lot,id])
   assert.equal((await check('FINAL 123')).status,'not_found')
   assert.equal((await db.query('select * from parking_vehicles where lot_id=$1',[lot])).rows.length,0)
   assert.equal((await db.query('select status from parking_reservations where id=$1',[next])).rows[0].status,'cancelled')
   assert.equal((await db.query('select * from parking_sessions')).rows.length,1)
   await assert.rejects(save(id,'GHOST 123'),/no longer exists/)
   assert.equal((await db.query('select * from parking_vehicles where lot_id=$1',[lot])).rows.length,0)
  })
 }finally{await db.close()}
})
