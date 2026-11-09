import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
const admin='11111111-1111-4111-8111-111111111111',alice='22222222-2222-4222-8222-222222222222',bob='33333333-3333-4333-8333-333333333333',staff='44444444-4444-4444-8444-444444444444',outsider='55555555-5555-4555-8555-555555555555'

test('assigned parking upgrade preserves visits and restricts every entry path',async t=>{
 const db=new PGlite()
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
   insert into auth.users values('${admin}','admin@example.com',now()),('${alice}','alice@example.com',now()),('${bob}','bob@example.com',now()),('${staff}','staff@example.com',now()),('${outsider}','other@example.com',now());`)
  async function login(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec(`set role ${role}`)}
  async function install(file){await db.exec(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8'))}
  await install('parking.sql');await install('002_self_service_spots.sql');await login(admin)
  const lot=(await db.query("select parking_create_lot('Assigned lot',4) as id")).rows[0].id
  const other=(await db.query("select parking_create_lot('Other lot',1) as id")).rows[0].id
  await db.query("select parking_add_staff($1,'staff@example.com')",[lot])
  const spots=(await db.query('select * from parking_list_spots($1)',[lot])).rows
  const foreignSpot=(await db.query('select * from parking_list_spots($1)',[other])).rows[0].id
  await db.exec('reset role');await install('003_user_home_reservations.sql');await install('004_permit_checker_edits.sql');await login(admin)
  const expires=(await db.query('select (current_date+30)::text as d')).rows[0].d
  const a=(await db.query("select parking_save_permit($1,null,'ALC 123','Alice',$2,true,'alice@example.com') as id",[lot,expires])).rows[0].id
  const b=(await db.query("select parking_save_permit($1,null,'BOB 123','Bob',$2,true,'bob@example.com') as id",[lot,expires])).rows[0].id
  const legacy=(await db.query("select parking_record_entry($1,'ALC 123',$2) as id",[lot,spots[0].id])).rows[0].id
  await login(bob)
  const start=new Date(Date.now()+3600000).toISOString(),end=new Date(Date.now()+7200000).toISOString()
  const booking=(await db.query("select parking_reserve($1,'BOB 123',$2,$3,$4) as id",[lot,spots[1].id,start,end])).rows[0].id
  await db.exec('reset role');await install('005_assigned_parking.sql');await install('005_assigned_parking.sql');await login(admin)
  async function save(id,plate,spot,owner='Alice',email='alice@example.com',active=true,expiry=expires){return (await db.query('select parking_save_permit_assigned($1,$2,$3,$4,$5,$6,$7,$8) as id',[lot,id,plate,owner,expiry,active,email,spot])).rows[0].id}
  await t.test('migration is rerunnable, keeps sessions and cancels bookings without guessing assignments',async()=>{
   const original=(await db.query('select * from parking_sessions where id=$1',[legacy])).rows[0]
   assert.equal(original.exit_at,null);assert.equal(original.spot_id,spots[0].id)
   assert.equal((await db.query('select assigned_spot_id from parking_vehicles where id=$1',[a])).rows[0].assigned_spot_id,null)
   await db.exec('reset role');assert.equal((await db.query('select status from parking_reservations where id=$1',[booking])).rows[0].status,'cancelled');await login(admin)
   assert.equal((await db.query("select parking_check_permit($1,'ALC 123') as result",[lot])).rows[0].result.status,'unassigned')
  })
  await t.test('only admin can assign an active same-lot spot, and a legacy parked spot is protected',async()=>{
   await login(bob)
   await assert.rejects(db.query("select parking_check_in_assigned($1,'BOB 123')",[lot]),/No parking spot is assigned/)
   await assert.rejects(save(b,'BOB 123',spots[1].id,'Bob','bob@example.com'),/Administrator/)
   await login(admin)
   await assert.rejects(save(b,'BOB 123',spots[0].id,'Bob','bob@example.com'),/Another vehicle is parked/)
   await assert.rejects(save(a,'ALC 123',foreignSpot),/active parking spot in this lot/)
   await assert.rejects(save(a,'ALC 123',null),/Assign an active/)
   // Align an existing permit with its actual currently occupied legacy spot.
   assert.equal(await save(a,'ALC 123',spots[0].id),a)
   await save(b,'BOB 123',spots[1].id,'Bob','bob@example.com')
   await assert.rejects(save(b,'BOB 123',spots[0].id,'Bob','bob@example.com'),/already assigned/)
   const check=(await db.query("select parking_check_permit($1,'ALC 123') as result",[lot])).rows[0].result
   assert.equal(check.status,'valid');assert.equal(check.assigned_spot_label,'P-001')
  })
  await t.test('driver sees only their assignment and checks out a pre-upgrade visit',async()=>{
   await login(alice)
   assert.equal((await db.query('select * from parking_spots')).rows.length,1)
   const own=(await db.query('select * from parking_spot_overview($1)',[lot])).rows
   assert.equal(own.length,1);assert.equal(own[0].assigned_plate,'ALC 123');assert.equal(own[0].occupied,true)
   assert.equal((await db.query('select * from parking_list_spots($1)',[lot])).rows.length,1)
   await db.query("select parking_check_out($1,'ALC 123')",[lot])
   const vacant=(await db.query('select * from parking_spot_overview($1)',[lot])).rows[0]
   assert.equal(vacant.occupied,false);assert.equal(vacant.assigned_vehicle_id,a)
   await assert.rejects(db.query('update parking_vehicles set assigned_spot_id=$1 where id=$2',[spots[1].id,a]),/permission denied/)
  })
  await t.test('entry derives assigned spot server-side and old endpoints cannot choose another',async()=>{
   await db.query("select parking_check_in_assigned($1,' alc  123 ')",[lot])
   const active=(await db.query('select * from parking_sessions where exit_at is null')).rows[0]
   assert.equal(active.spot_id,spots[0].id);assert.equal(active.driver_user_id,alice);assert.equal(active.expected_exit_at,null);assert.equal(active.reservation_id,null)
   await assert.rejects(db.query("select parking_check_in_assigned($1,'ALC 123')",[lot]),/already checked in/)
   await assert.rejects(db.query("select parking_record_entry($1,'ALC 123',$2)",[lot,spots[1].id]),/only check in to the spot assigned/)
   await assert.rejects(db.query("select parking_start_visit($1,'ALC 123',$2,$3)",[lot,spots[1].id,end]),/only check in to the spot assigned/)
   await login(bob)
   await assert.rejects(db.query("select parking_check_in_assigned($1,'ALC 123')",[lot]),/not linked/)
   await assert.rejects(db.query("select parking_check_out($1,'ALC 123')",[lot]),/your account/)
   await db.query("select parking_check_in_assigned($1,'BOB 123')",[lot])
   assert.equal((await db.query('select * from parking_sessions where exit_at is null')).rows.length,1)
   await login(admin)
   assert.equal((await db.query('select * from parking_sessions where lot_id=$1 and exit_at is null',[lot])).rows.length,2)
   assert.equal((await db.query('select * from parking_spot_overview($1)',[lot])).rows.filter(row=>row.occupied).length,2)
  })
  await t.test('an assignment cannot change or be deleted while parked; editing remains an update',async()=>{
   await assert.rejects(save(a,'ALC 123',spots[2].id),/Check this vehicle out/)
   await assert.rejects(save(a,'NEW 123',spots[0].id),/Check this vehicle out/)
   await assert.rejects(db.query('select parking_delete_permit($1,$2)',[lot,a]),/Check this vehicle out/)
   await login(alice);await db.query("select parking_check_out($1,'ALC 123')",[lot]);await login(admin)
   assert.equal(await save(a,'NEW 123',spots[2].id),a)
   assert.equal((await db.query('select * from parking_vehicles where id=$1',[a])).rows[0].assigned_spot_id,spots[2].id)
   assert.equal((await db.query("select * from parking_vehicles where plate='ALC 123'")).rows.length,0)
   assert.equal((await db.query("select * from parking_sessions where plate='ALC 123'")).rows.length,2)
   await assert.rejects(db.query("select parking_update_lot($1,'Lot',2)",[lot]),/spot is assigned/)
  })
  await t.test('expired or inactive permits retain assignments but cannot check in; checkout still works',async()=>{
   const past=(await db.query('select (current_date-1)::text as d')).rows[0].d
   await save(a,'NEW 123',spots[2].id,'Alice','alice@example.com',false)
   await assert.rejects(save(b,'BOB 123',spots[2].id,'Bob','bob@example.com'),/already assigned/)
   await login(alice);await assert.rejects(db.query("select parking_check_in_assigned($1,'NEW 123')",[lot]),/valid active permit/)
   await login(admin);await save(a,'NEW 123',spots[2].id,'Alice','alice@example.com',true,past)
   await login(alice);await assert.rejects(db.query("select parking_check_in_assigned($1,'NEW 123')",[lot]),/valid active permit/)
   await login(admin);await save(a,'NEW 123',spots[2].id)
   await login(alice);await db.query("select parking_check_in_assigned($1,'NEW 123')",[lot]);await login(admin)
   await save(a,'NEW 123',spots[2].id,'Alice','alice@example.com',false)
   await login(alice);await db.query("select parking_check_out($1,'NEW 123')",[lot]);await login(admin)
  })
  await t.test('reservations and older no-assignment editors are disabled in the database',async()=>{
   await login(alice)
   await assert.rejects(db.query("select parking_reserve($1,'NEW 123',$2,$3,$4)",[lot,spots[2].id,start,end]),/no longer available/)
   await assert.rejects(db.query('select * from parking_reservation_spots($1,$2,$3)',[lot,start,end]),/no longer available/)
   await assert.rejects(db.query('select parking_cancel_reservation($1)',[booking]),/no longer available/)
   await assert.rejects(db.query('select * from parking_reservations'),/permission denied/)
   await assert.rejects(db.query("select parking_start_visit($1,'NEW 123',$2,$3,$4)",[lot,spots[2].id,end,booking]),/no longer available/)
   await login(admin)
   await assert.rejects(db.query("select parking_save_permit($1,$2,'NEW 123','Alice',$3,true,'alice@example.com')",[lot,a,expires]),/permission denied/)
   await assert.rejects(db.query("select parking_save_vehicle($1,'BYP 123','Bypass',$2,true)",[lot,expires]),/permission denied/)
   await assert.rejects(db.query("select parking_save_vehicle_account($1,'BYP 123','Bypass',$2,true,'alice@example.com')",[lot,expires]),/permission denied/)
  })
  await t.test('staff can record assigned entries and admin occupancy reflects checkouts',async()=>{
   await save(a,'NEW 123',spots[2].id)
   await login(staff);await db.query("select parking_check_in($1,'NEW 123')",[lot])
   const row=(await db.query("select * from parking_sessions where plate='NEW 123' and exit_at is null")).rows[0]
   assert.equal(row.entered_by,staff);assert.equal(row.driver_user_id,alice);assert.equal(row.spot_id,spots[2].id)
   await assert.rejects(save(a,'NEW 123',spots[0].id),/Administrator/)
   await login(alice);await db.query("select parking_check_out($1,'NEW 123')",[lot]);await login(bob);await db.query("select parking_check_out($1,'BOB 123')",[lot]);await login(admin)
   assert.equal((await db.query('select * from parking_spot_overview($1)',[lot])).rows.filter(row=>row.occupied).length,0)
   assert.equal((await db.query('select * from parking_spot_overview($1)',[lot])).rows.filter(row=>row.assigned_vehicle_id).length,2)
   await db.query('select parking_delete_permit($1,$2)',[lot,a])
   await save(b,'BOB 123',spots[2].id,'Bob','bob@example.com')
   assert.equal((await db.query('select * from parking_vehicles where id=$1',[b])).rows[0].assigned_spot_id,spots[2].id)
  })
  await t.test('unrelated users and anonymous clients cannot inspect or occupy assigned spots',async()=>{
   await login(outsider)
   assert.equal((await db.query('select * from parking_spots')).rows.length,0)
   assert.equal((await db.query('select * from parking_sessions')).rows.length,0)
   await assert.rejects(db.query('select * from parking_spot_overview($1)',[lot]),/Parking access/)
   await assert.rejects(db.query("select parking_check_in_assigned($1,'BOB 123')",[lot]),/Parking access/)
   await login('','anon');await assert.rejects(db.query("select parking_check_in_assigned($1,'BOB 123')",[lot]),/permission denied/)
  })
 }finally{await db.close()}
})
