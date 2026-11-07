import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const admin = '11111111-1111-4111-8111-111111111111'
const alice = '22222222-2222-4222-8222-222222222222'
const bob = '33333333-3333-4333-8333-333333333333'
const stranger = '55555555-5555-4555-8555-555555555555'

test('self-service upgrade protects drivers and allocates uniquely identified spots', async t => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;
      grant execute on function auth.uid() to authenticated,anon;
      insert into auth.users values('${admin}','admin@example.com',now()),('${alice}','alice@example.com',now()),('${bob}','bob@example.com',now()),('${stranger}','stranger@example.com',now());`)
    async function login(id, role = 'authenticated') {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
      await db.exec(`set role ${role}`)
    }
    await db.exec(await readFile(new URL('../supabase/parking.sql',import.meta.url),'utf8'))
    await login(admin)
    const lot = (await db.query("select parking_create_lot('Existing lot',2) as id")).rows[0].id
    await db.query("select parking_check_in($1,'OLD 123','Legacy visitor')",[lot])
    await db.exec('reset role')
    const upgrade = await readFile(new URL('../supabase/002_self_service_spots.sql',import.meta.url),'utf8')
    await db.exec(upgrade)
    await db.exec(upgrade)
    await login(admin)
    let spots = (await db.query('select * from parking_list_spots($1)',[lot])).rows
    const first = spots[0].id, second = spots[1].id
    await t.test('upgrade is rerunnable and preserves existing sessions with spot assignments', async () => {
      assert.deepEqual(spots.map(item=>item.label),['P-001','P-002'])
      const old = (await db.query('select * from parking_sessions')).rows[0]
      assert.equal(old.spot_id, first); assert.equal(old.spot_label,'P-001')
      assert.equal(spots[0].occupied,true)
      await db.query("select parking_check_out($1,'OLD 123')",[lot])
    })
    await t.test('admin links confirmed driver accounts atomically; bad email saves nothing',async()=>{
      await db.query("select parking_save_vehicle_account($1,'ALC 123','Alice',current_date+30,true,'alice@example.com')",[lot])
      await db.query("select parking_save_vehicle_account($1,'BOB 123','Bob',current_date+30,true,'bob@example.com')",[lot])
      await assert.rejects(db.query("select parking_save_vehicle_account($1,'BAD 123','Nobody',current_date,true,'missing@example.com')",[lot]),/confirm an account/)
      assert.equal((await db.query("select * from parking_vehicles where plate='BAD 123'")).rows.length,0)
      assert.equal((await db.query('select role from parking_members where user_id=$1',[alice])).rows[0].role,'driver')
    })
    await t.test('driver sees only own vehicle and can record their own arrival',async()=>{
      await login(alice)
      const rows = (await db.query('select * from parking_vehicles')).rows
      assert.equal(rows.length,1); assert.equal(rows[0].plate,'ALC 123')
      assert.equal((await db.query('select * from parking_members')).rows.length,1)
      await assert.rejects(db.query('select * from parking_list_members($1)',[lot]),/Staff access/)
      await assert.rejects(db.query("select parking_save_vehicle($1,'NEW 123','Me',current_date,true)",[lot]),/Administrator/)
      await assert.rejects(db.query("select parking_save_vehicle_account($1,'BOB 123','Me',current_date,true,'alice@example.com')",[lot]),/Administrator/)
      await assert.rejects(db.query("select parking_record_entry($1,'BOB 123',$2)",[lot,first]),/not linked/)
      await assert.rejects(db.query("select parking_record_entry($1,'ALC 123',null)",[lot]),/Choose an available/)
      await db.query("select parking_record_entry($1,' alc  123 ',$2)",[lot,first])
      const session = (await db.query('select * from parking_sessions')).rows[0]
      assert.equal(session.driver_user_id,alice); assert.equal(session.entered_by,alice); assert.equal(session.spot_label,'P-001')
    })
    await t.test('another driver sees occupancy without identity, and cannot take an occupied spot',async()=>{
      await login(bob)
      assert.equal((await db.query('select * from parking_sessions')).rows.length,0)
      spots = (await db.query('select * from parking_list_spots($1)',[lot])).rows
      assert.equal(spots[0].occupied,true); assert.equal('plate' in spots[0],false)
      await assert.rejects(db.query("select parking_record_entry($1,'BOB 123',$2)",[lot,first]),/spot was just taken/)
      await assert.rejects(db.query("select parking_check_out($1,'ALC 123')",[lot]),/your account/)
      await db.query("select parking_record_entry($1,'BOB 123',$2)",[lot,second])
      await assert.rejects(db.query("select parking_record_entry($1,'BOB 123',$2)",[lot,second]),/already checked in/)
      await assert.rejects(db.query('update parking_spots set active=false where id=$1',[first]),/permission denied/)
    })
    await t.test('occupied spot IDs survive capacity changes and cannot be removed',async()=>{
      await login(admin)
      await assert.rejects(db.query("select parking_update_lot($1,'Lot',1)",[lot]),/lower than current occupancy/)
      await assert.rejects(db.query("select parking_save_vehicle_account($1,'ALC 123','Alice',current_date+30,true,'bob@example.com')",[lot]),/Check this vehicle out/)
      await db.query("select parking_update_lot($1,'Lot',3)",[lot])
      const expanded = (await db.query('select * from parking_list_spots($1)',[lot])).rows
      assert.equal(expanded.length,3); assert.equal(expanded[0].id,first); assert.equal(expanded[1].id,second)
      await login(alice)
      await db.query("select parking_check_out($1,'ALC 123')",[lot])
      assert.equal((await db.query('select * from parking_list_spots($1)',[lot])).rows[0].occupied,false)
      await login(admin)
      await assert.rejects(db.query("select parking_update_lot($1,'Lot',1)",[lot]),/occupied spot would be removed/)
    })
    await t.test('expired permits cannot bypass approval, but driver can always close own session',async()=>{
      await login(admin)
      await db.query("select parking_save_vehicle_account($1,'BOB 123','Bob',current_date-1,false,'bob@example.com')",[lot])
      await login(bob)
      await db.query("select parking_check_out($1,'BOB 123')",[lot])
      await assert.rejects(db.query("select parking_record_entry($1,'BOB 123',$2,'I approve myself')",[lot,second]),/valid active permit/)
      await assert.rejects(db.query("select parking_check_in($1,'BOB 123','Bypass')",[lot]),/Staff access/)
      await login(admin)
      await db.query("select parking_record_entry($1,'BOB 123',$2,'Staff approved visitor')",[lot,second])
      await login(bob)
      const open = (await db.query('select * from parking_sessions where exit_at is null')).rows[0]
      assert.equal(open.admission,'visitor'); assert.equal(open.entered_by,admin); assert.equal(open.driver_user_id,bob)
      await db.query("select parking_check_out($1,'BOB 123')",[lot])
    })
    await t.test('capacity reductions retain historical spot IDs and reject spots from other lots',async()=>{
      await login(admin)
      await db.query("select parking_update_lot($1,'Lot',1)",[lot])
      const retired = (await db.query('select * from parking_list_spots($1)',[lot])).rows
      assert.equal(retired[1].active,false); assert.equal(retired[1].id,second)
      const otherLot = (await db.query("select parking_create_lot('Other lot',1) as id")).rows[0].id
      const foreignSpot = (await db.query('select * from parking_list_spots($1)',[otherLot])).rows[0].id
      await login(alice)
      await assert.rejects(db.query("select parking_record_entry($1,'ALC 123',$2)",[lot,foreignSpot]),/in this lot/)
      await assert.rejects(db.query("select parking_record_entry($1,'ALC 123',$2)",[lot,second]),/in this lot/)
      const old = (await db.query("select * from parking_sessions where plate='ALC 123'")).rows[0]
      assert.equal(old.spot_id,first); assert.equal(old.spot_label,'P-001')
    })
    await t.test('account transfers preserve private history and removing staff restores driver-only access',async()=>{
      await login(admin)
      await db.query("select parking_save_vehicle_account($1,'ALC 123','Bob',current_date+30,true,'bob@example.com')",[lot])
      await login(alice)
      assert.equal((await db.query('select * from parking_vehicles')).rows.length,0)
      const aliceHistory = (await db.query('select * from parking_sessions')).rows
      assert.equal(aliceHistory.length,1); assert.equal(aliceHistory[0].plate,'ALC 123')
      await login(bob)
      assert.equal((await db.query("select * from parking_sessions where plate='ALC 123'")).rows.length,0)
      await login(admin)
      await db.query("select parking_add_staff($1,'bob@example.com')",[lot])
      await login(bob)
      assert.equal((await db.query('select public.parking_is_member($1) as allowed',[lot])).rows[0].allowed,true)
      await login(admin)
      await db.query('select parking_remove_staff($1,$2)',[lot,bob])
      await login(bob)
      assert.equal((await db.query('select public.parking_is_member($1) as allowed',[lot])).rows[0].allowed,false)
      assert.equal((await db.query('select role from parking_members')).rows[0].role,'driver')
      await assert.rejects(db.query('update parking_sessions set exit_at=null'),/permission denied/)
    })
    await t.test('unrelated and anonymous accounts cannot inspect or change spots or sessions',async()=>{
      await login(stranger)
      for(const table of ['parking_lots','parking_vehicles','parking_sessions','parking_spots','parking_members']) assert.equal((await db.query(`select * from ${table}`)).rows.length,0)
      await assert.rejects(db.query('select * from parking_list_spots($1)',[lot]),/Parking access/)
      await assert.rejects(db.query("select parking_record_entry($1,'ALC 123',$2)",[lot,first]),/Parking access/)
      await login('','anon')
      await assert.rejects(db.query('select * from parking_spots'),/permission denied/)
      await assert.rejects(db.query('select * from parking_list_spots($1)',[lot]),/permission denied/)
    })
  }finally{await db.close()}
})
