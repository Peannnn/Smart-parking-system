import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const admin = '11111111-1111-4111-8111-111111111111'
const staff = '22222222-2222-4222-8222-222222222222'
const outsider = '33333333-3333-4333-8333-333333333333'

test('parking database enforces permits, capacity, sessions and account access', async t => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon; create role authenticated;
      create schema auth;
      create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
      insert into auth.users values ('${admin}','admin@example.com',now()),('${staff}','staff@example.com',now()),('${outsider}','other@example.com',now());`)
    const sql = await readFile(new URL('../supabase/parking.sql', import.meta.url), 'utf8')
    await db.exec(sql)
    await db.exec(sql) // Migration may be safely rerun.
    async function login(id, role = 'authenticated') {
      await db.exec('reset role')
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
      await db.exec(`set role ${role}`)
    }
    await login(admin)
    const { rows } = await db.query("select public.parking_create_lot('Test lot',1) as id")
    const lot = rows[0].id
    await t.test('creator becomes admin and staff can be added by email', async () => {
      assert.equal((await db.query('select role from parking_members')).rows[0].role, 'admin')
      await db.query('select parking_add_staff($1,$2)', [lot, 'staff@example.com'])
      assert.equal((await db.query('select * from parking_list_members($1)', [lot])).rows.length, 2)
    })
    await t.test('expired or missing permits require explicit visitor approval', async () => {
      await assert.rejects(db.query('select parking_check_in($1,$2)', [lot, 'VIS 123']), /No valid permit/)
      await db.query("select parking_save_vehicle($1,'EXP 123','Expired owner',current_date-1,true)", [lot])
      await assert.rejects(db.query('select parking_check_in($1,$2)', [lot, 'EXP 123']), /No valid permit/)
      await db.query("select parking_save_vehicle($1,'ABC 123','Resident',current_date+30,true)", [lot])
      await db.query('select parking_check_in($1,$2)', [lot, ' abc  123 '])
    })
    await t.test('duplicates, full lots, and invalid capacity reductions are rejected', async () => {
      await assert.rejects(db.query('select parking_check_in($1,$2)', [lot, 'ABC 123']), /already checked in/)
      await assert.rejects(db.query('select parking_check_in($1,$2,$3)', [lot, 'VIS 123', 'Visiting resident']), /full/)
      await assert.rejects(db.query('select parking_update_lot($1,$2,$3)', [lot, 'Test lot', 0]), /lower than current occupancy/)
      assert.equal((await db.query('select * from parking_sessions where exit_at is null')).rows.length, 1)
    })
    await t.test('staff can operate sessions, but cannot change permits or lot settings', async () => {
      await login(staff)
      await assert.rejects(db.query('select parking_update_lot($1,$2,$3)', [lot, 'Bad', 50]), /Administrator/)
      await assert.rejects(db.query("select parking_save_vehicle($1,'NEW 123','Owner',current_date,true)", [lot]), /Administrator/)
      await assert.rejects(db.query('select parking_add_staff($1,$2)', [lot, 'other@example.com']), /Administrator/)
      await assert.rejects(db.query('update parking_lots set capacity=50 where id=$1', [lot]), /permission denied/)
      await db.query('select parking_check_out($1,$2)', [lot, 'ABC 123'])
      await assert.rejects(db.query('select parking_check_out($1,$2)', [lot, 'ABC 123']), /No open/)
      await db.query('select parking_check_in($1,$2,$3)', [lot, 'VIS 123', 'Visiting unit 12'])
      const session = (await db.query("select * from parking_sessions where exit_at is null")).rows[0]
      assert.equal(session.admission, 'visitor'); assert.equal(session.visitor_reason, 'Visiting unit 12')
      assert.equal((await db.query('select * from parking_list_members($1)', [lot])).rows[0].email, null)
    })
    await t.test('unrelated users and anonymous clients cannot access the lot', async () => {
      await login(outsider)
      for (const table of ['parking_lots','parking_vehicles','parking_sessions','parking_members']) assert.equal((await db.query(`select * from ${table}`)).rows.length, 0)
      await assert.rejects(db.query('select parking_check_out($1,$2)', [lot, 'VIS 123']), /Staff access/)
      await assert.rejects(db.query('select parking_list_members($1)', [lot]), /Staff access/)
      await login('', 'anon')
      await assert.rejects(db.query('select * from parking_lots'), /permission denied/)
      await assert.rejects(db.query("select parking_create_lot('Unauthorized',20)"), /permission denied/)
    })
    await t.test('removing staff revokes their lot access without deleting history', async () => {
      await login(admin)
      await db.query('select parking_remove_staff($1,$2)', [lot, staff])
      await login(staff)
      assert.equal((await db.query('select * from parking_sessions')).rows.length, 0)
      await assert.rejects(db.query('select parking_check_out($1,$2)', [lot, 'VIS 123']), /Staff access/)
      await login(admin)
      assert.equal((await db.query('select * from parking_sessions')).rows.length, 2)
    })
  } finally { await db.close() }
})
