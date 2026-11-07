import { useClock } from './useClock'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../utils/supabase'
import Scanner from './App.jsx'
import DriverParking from './DriverParking.jsx'
import PermitChecker from './PermitChecker.jsx'
import DeletePermitDialog from './DeletePermitDialog.jsx'
import Reservations from './Reservations.jsx'
import { homePage, parkingPages, localDateTime } from './navigation'
import { csvCell, duration, normalizePlate, permitStatus, validPlate } from './parking'
import './Parking.css'

const formatTime = value => value ? new Date(value).toLocaleString() : 'Still parked'
const initialVehicle = { plate: '', owner_name: '', permit_expires: '', active: true, driver_email: '' }

  function SessionTable({ rows, checkout = false, busy = false, onCheckout }) {
    return rows.length ? <div className="table-scroll"><table><thead><tr><th>Plate</th><th>Spot ID</th><th>Entry</th><th>{checkout ? 'Time parked' : 'Exit'}</th><th>Admission</th>{checkout && <th>Action</th>}</tr></thead><tbody>{rows.map(item => <tr key={item.id}><td><strong className="table-plate">{item.plate}</strong></td><td><span className="spot-tag">{item.spot_label || 'Legacy / unassigned'}</span></td><td>{formatTime(item.entry_at)}</td><td>{checkout ? duration(item.entry_at) : <>{formatTime(item.exit_at)}{item.exit_at && <small className="duration-label">{duration(item.entry_at, item.exit_at)}</small>}</>}</td><td><span className="source-label">{item.admission}</span>{item.visitor_reason && <small className="duration-label">{item.visitor_reason}</small>}</td>{checkout && <td><button className="text-action" disabled={busy} onClick={() => onCheckout(item.plate)}>Check out</button></td>}</tr>)}</tbody></table></div> : <p className="parking-empty">No parking sessions to show.</p>
  }


async function allRows(table, lotId, openOnly = false) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    let query = supabase.from(table).select('*').eq('lot_id', lotId).order('id').range(offset, offset + 499)
    if (openOnly) query = query.is('exit_at', null)
    const { data, error } = await query
    if (error) return { data: null, error }
    rows.push(...data)
    if (data.length < 500) return { data: rows, error: null }
  }
}

async function allSpots(lotId) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.rpc('parking_list_spots', { p_lot: lotId }).order('number').range(offset, offset + 499)
    if (error) return { data: null, error }
    rows.push(...data)
    if (data.length < 500) return { data: rows, error: null }
  }
}

export default function Parking({ userId }) {
  const [lots, setLots] = useState([])
  const [lotId, setLotId] = useState('')
  const [members, setMembers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [sessions, setSessions] = useState([])
  const [spots, setSpots] = useState([])
  const [reservations, setReservations] = useState([])
  const [pendingReservation, setPendingReservation] = useState(null)
  const [until, setUntil] = useState(() => localDateTime(Date.now() + 3600000))
  const [selectedSpot, setSelectedSpot] = useState('')
  const [scannerVersion, setScannerVersion] = useState(0)
  const [page, setPage] = useState('Park now')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState(50)
  const [vehicle, setVehicle] = useState(initialVehicle)
  const [deleteVehicle, setDeleteVehicle] = useState(null)
  const [staffEmail, setStaffEmail] = useState('')
  const [search, setSearch] = useState('')
  const now = useClock()
  const [direction, setDirection] = useState('entry')
  const [review, setReview] = useState(null)
  const [visitor, setVisitor] = useState(false)
  const [reason, setReason] = useState('')
  const [history, setHistory] = useState([])
  const [historyPage, setHistoryPage] = useState(0)
  const [historyMore, setHistoryMore] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const activeLot = useRef('')
  const sequence = useRef(0)
  const historySequence = useRef(0)
  const mutationLock = useRef(false)
  const lot = lots.find(item => item.id === lotId)
  const role = members.find(item => item.user_id === userId)?.role
  const operator = role === 'admin' || role === 'staff'
  const admin = members.some(item => item.user_id === userId && item.role === 'admin')
  const open = sessions.filter(item => !item.exit_at)
  const matchingVehicle = vehicles.find(item => item.plate === review)
  const status = permitStatus(matchingVehicle)
  const matchingSession = open.find(item => item.plate === review)
  const availableSpots = spots.filter(item => item.active && !item.occupied)
  const chosenSpot = availableSpots.find(item => item.id === selectedSpot)

  const refresh = useCallback(async (preferred) => {
    const request = ++sequence.current
    const { data: nextLots, error } = await supabase.from('parking_lots').select('*').order('created_at')
    if (error) throw error
    const selected = nextLots.find(item => item.id === preferred)?.id || nextLots[0]?.id || ''
    let results = []
    let nextRole = ''
    if (selected) {
      const access = await supabase.from('parking_members').select('*').eq('lot_id', selected).eq('user_id', userId).single()
      if (access.error) throw access.error
      nextRole = access.data.role
      results = await Promise.all([
        nextRole === 'driver' ? Promise.resolve({ data: [access.data], error: null }) : supabase.rpc('parking_list_members', { p_lot: selected }),
        allRows('parking_vehicles', selected),
        allRows('parking_sessions', selected, true),
        allSpots(selected),
        allRows('parking_reservations', selected),
      ])
      const problem = results.find(result => result.error)?.error
      if (problem) throw problem
    }
    if (request !== sequence.current) return
    if (activeLot.current !== selected) {
      activeLot.current = selected; setReview(null); setVehicle(initialVehicle); setSearch(''); setPage(homePage(nextRole)); setHistory([]); setSelectedSpot(''); setPendingReservation(null); setDeleteVehicle(null)
    }
    setPage(current => parkingPages(nextRole).includes(current) ? current : homePage(nextRole))
    setLots(nextLots); setLotId(selected)
    setMembers(results[0]?.data || []); setVehicles((results[1]?.data || []).sort((a, b) => a.plate.localeCompare(b.plate))); setSessions(results[2]?.data || []); setSpots(results[3]?.data || []); setReservations(results[4]?.data || [])
  }, [userId])

  useEffect(() => {
    let active = true
    const timer = setTimeout(() => refresh().catch(error => { if (active) setError(error.message) }).finally(() => { if (active) setLoading(false) }), 0)
    return () => { active = false; clearTimeout(timer); sequence.current += 1 }
  }, [refresh])

  // Poll to pick up other staff actions. Mutations always recheck live database state.
  useEffect(() => {
    if (!lotId) return
    const interval = setInterval(() => {
      if (!mutationLock.current) refresh(lotId).catch(error => setError(error.message))
    }, 15000)
    return () => clearInterval(interval)
  }, [lotId, refresh])

  const loadHistory = useCallback(async (offset = 0) => {
    if (!lotId) return
    const request = ++historySequence.current
    setHistoryLoading(true)
    try {
      const { data, error } = await supabase.from('parking_sessions').select('*').eq('lot_id', lotId).order('entry_at', { ascending: false }).order('id').range(offset * 50, offset * 50 + 50)
      if (error) throw error
      if (request !== historySequence.current) return
      setHistory(data.slice(0, 50)); setHistoryPage(offset); setHistoryMore(data.length > 50)
    } catch (error) { if (request === historySequence.current) setError(error.message) }
    finally { if (request === historySequence.current) setHistoryLoading(false) }
  }, [lotId])

  useEffect(() => {
    const timer = setTimeout(() => { if (page === 'History') loadHistory() }, 0)
    return () => { clearTimeout(timer); historySequence.current += 1 }
  }, [page, loadHistory])

  async function mutate(action, message, after) {
    if (mutationLock.current) return
    mutationLock.current = true; setBusy(true); setError(''); setNotice('')
    let saved = false
    try {
      const { data, error } = await action()
      if (error) throw error
      saved = true
      after?.()
      setNotice(message)
      await refresh(typeof data === 'string' && !lotId ? data : lotId)
    } catch (error) { setError(saved ? `Saved successfully, but the dashboard could not refresh: ${error.message}. Use Refresh to reload it.` : error.message) }
    finally { mutationLock.current = false; setBusy(false) }
  }

  function reviewPlate(plate) {
    if (mutationLock.current) throw new Error('Wait for the current action to finish.')
    const normalized = normalizePlate(plate)
    if (!validPlate(normalized)) throw new Error('Enter a valid plate (2–15 characters).')
    setReview(normalized); setPendingReservation(null); setSelectedSpot(''); setVisitor(false); setReason(''); setError(''); setNotice('')
  }

  function exportHistory() {
    const rows = [['Plate', 'Spot ID', 'Entry', 'Exit', 'Admission', 'Visitor reason'], ...history.map(item => [item.plate, item.spot_label, item.entry_at, item.exit_at, item.admission, item.visitor_reason])]
    const url = URL.createObjectURL(new Blob(['\uFEFF' + rows.map(row => row.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'parking-history-page.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }


  return <div className="parking-shell">
    <header className="topbar"><a className="brand" href="#" onClick={event => { event.preventDefault(); setPage(homePage(role)) }}><span className="brand-icon">P</span>Smart<span className="brand-light">Park</span></a><span className="workspace-label">PARKING MANAGEMENT</span><span className="device-badge">{admin ? 'Administrator' : operator ? 'Staff' : 'Driver'}</span></header>
    <main>
      <div className="parking-toolbar"><label>Parking lot <select aria-label="Parking lot" value={lotId} disabled={busy || loading || !lots.length} onChange={event => { const id = event.target.value; setReview(null); setSearch(''); setVehicle(initialVehicle); setLoading(true); refresh(id).catch(error => setError(error.message)).finally(() => setLoading(false)) }}>{!lots.length && <option value="">No parking lot linked yet</option>}{lots.map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><button className="button secondary subtle" disabled={busy || loading} onClick={() => { setLoading(true); setError(''); refresh(lotId).catch(error => setError(error.message)).finally(() => setLoading(false)) }}>Refresh</button></div>
      {error && <div className="parking-alert" role="alert"><strong>Unable to complete this action</strong><p>{error}</p>{/schema cache|does not exist|could not find/i.test(error) && <p>Database setup is required. Ask your administrator to complete the parking database upgrade, then choose Refresh.</p>}</div>}
      {notice && <p className="notice parking-notice" role="status">{notice}</p>}
      {loading ? <p className="parking-empty" role="status">Loading parking workspace…</p> : <>
        <nav className="parking-nav" aria-label="Parking workspace">{parkingPages(role).map(tab => <button key={tab} aria-current={page === tab ? 'page' : undefined} disabled={busy} onClick={() => { setPage(tab); setSearch(''); if (tab === 'Entry / Exit') { setReview(null); setPendingReservation(null) } if (tab === 'Park now') setPendingReservation(null) }}>{tab}</button>)}</nav>
        {!lot ? <section className="panel onboarding" aria-labelledby="new-user-title">
          <p className="eyebrow">YOUR PARKING ACCOUNT</p><h1 id="new-user-title">{page}<span>.</span></h1>
          <p>{page === 'Reservations' ? 'Your upcoming bookings will appear here once you have access to a parking lot.' : page === 'History' ? 'Your recorded entries and exits will appear here after your first visit.' : 'Welcome! Pick a spot and scan your plate once your vehicle is linked to a parking lot.'}</p>
          <div className="driver-access-note"><strong>Connect your vehicle</strong><p>Ask your parking administrator to link your confirmed account email to your vehicle permit. Then choose Refresh to see your parking lot and start parking.</p></div>
        </section> : <>
        {page === 'Dashboard' && operator && <>
          <section className="page-heading"><div><p className="eyebrow">LIVE PARKING OVERVIEW</p><h1>{lot.name}<span>.</span></h1><p>Manage arrivals, departures, and permits in one place.</p></div><button className="button secondary" onClick={() => setPage('Entry / Exit')}>Record entry or exit →</button></section>
          <div className="parking-stats"><article><span>Available spaces</span><strong>{Math.max(0, lot.capacity - open.length)}</strong><small>of {lot.capacity} total spaces</small></article><article><span>Currently parked</span><strong>{open.length}</strong><small>{Math.round(open.length / lot.capacity * 100)}% occupancy</small></article><article><span>Visitor vehicles</span><strong>{open.filter(item => item.admission === 'visitor').length}</strong><small>Currently checked in</small></article><article><span>Permits needing attention</span><strong>{vehicles.filter(item => permitStatus(item) !== 'Valid permit').length}</strong><small>Expired or inactive</small></article></div>
          {open.length >= lot.capacity && <p className="parking-alert" role="status">Lot full. Check out a vehicle before admitting another.</p>}
          <section className="panel"><div className="panel-heading"><h2>Currently parked</h2><input className="parking-search" aria-label="Search parked plates" placeholder="Search plate…" value={search} onChange={event => setSearch(event.target.value)} /></div><SessionTable rows={open.filter(item => item.plate.includes(search.toUpperCase()))} checkout busy={busy} onCheckout={plate => { setDirection('exit'); reviewPlate(plate); setPage('Entry / Exit') }} /></section>
          <p className="privacy-note">Updates every 15 seconds. Availability assumes every entry and exit is recorded; spot availability is based on recorded sessions, not sensors.</p>
        </>}
        {page === 'Entry / Exit' && operator && <>
          <div className="parking-page-title"><h1>Entry & exit<span>.</span></h1><p>Scan or type a plate, then confirm the parking action.</p></div>
          <div className="direction-switch" aria-label="Parking action">{['entry','exit'].map(value => <button disabled={busy} key={value} aria-pressed={direction === value} onClick={() => { setDirection(value); setReview(null) }}>{value === 'entry' ? '↓ Vehicle entry' : '↑ Vehicle exit'}</button>)}</div>
          {review && <section className="panel admission-panel" aria-labelledby="admission-title"><h2 id="admission-title">Confirm {direction === 'entry' ? 'entry' : 'exit'} · <span className="table-plate">{review}</span></h2><p>{direction === 'exit' ? matchingSession ? `Spot ${matchingSession.spot_label || 'unassigned'} · Checked in ${formatTime(matchingSession.entry_at)} · ${duration(matchingSession.entry_at)} parked` : 'No open parking session found. Refresh if another staff member recently checked this vehicle in.' : `${status}${matchingVehicle ? ` · ${matchingVehicle.owner_name} · expires ${matchingVehicle.permit_expires} (UTC)` : ''}`}</p>
          {direction === 'entry' && status !== 'Valid permit' && !matchingSession && <><label className="visitor-check"><input type="checkbox" checked={visitor} disabled={busy} onChange={event => setVisitor(event.target.checked)} /> Approve this vehicle as a visitor</label>{visitor && <label className="visitor-reason">Reason for approval<input value={reason} disabled={busy} onChange={event => setReason(event.target.value)} minLength={3} maxLength={200} placeholder="Visiting resident in unit 12" /></label>}</>}
          {direction === 'entry' && !matchingSession && <label className="visitor-reason">Parking spot<select aria-label="Parking spot" value={chosenSpot ? selectedSpot : ''} disabled={busy} onChange={event => setSelectedSpot(event.target.value)}><option value="">Choose an available spot</option>{availableSpots.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>}
          {direction === 'entry' && !matchingSession && <label className="visitor-reason">Expected departure<input type="datetime-local" required value={until} disabled={busy} onChange={event => setUntil(event.target.value)} /></label>}
          {direction === 'entry' && matchingSession && <p className="error">This vehicle is already checked in.</p>}
          <div className="admission-actions"><button className="button primary" disabled={busy || (direction === 'entry' ? !until || new Date(until).getTime() <= now || !chosenSpot || Boolean(matchingSession) || open.length >= lot.capacity || (status !== 'Valid permit' && (!visitor || reason.trim().length < 3)) : !matchingSession)} onClick={() => mutate(() => supabase.rpc(direction === 'entry' ? 'parking_start_visit' : 'parking_check_out', { p_lot: lotId, p_plate: review, ...(direction === 'entry' ? { p_spot: selectedSpot, p_until: new Date(until).toISOString(), p_reservation: pendingReservation?.plate === review ? pendingReservation.id : null, p_visitor_reason: visitor ? reason.trim() : null } : {}) }), `${review} checked ${direction === 'entry' ? 'in' : 'out'} successfully.`, () => { setReview(null); setScannerVersion(value => value + 1) })}>{busy ? 'Saving…' : direction === 'entry' ? 'Confirm check-in' : 'Confirm check-out'}</button><button className="button secondary subtle" disabled={busy} onClick={() => { setReview(null); setNotice(direction === 'entry' ? 'Entry cancelled. No parking session was created.' : 'Exit cancelled.') }}>{direction === 'entry' && status !== 'Valid permit' ? 'Deny entry' : 'Cancel'}</button></div></section>}
          <fieldset className="embedded-scanner" disabled={busy}><Scanner key={`${lotId}-${scannerVersion}`} userId={userId} onRecord={reviewPlate} /></fieldset>
        </>}
        {page === 'Vehicles & permits' && operator && <>
          <div className="parking-page-title"><h1>Vehicles & permits<span>.</span></h1><p>Resident registrations and permit validity. Expiry dates include the full day in UTC.</p></div>
          {admin && <section className="panel parking-edit"><h2>{vehicle.id ? `Edit permit · ${vehicles.find(item => item.id === vehicle.id)?.plate || vehicle.plate}` : 'Register a vehicle'}</h2><form className="parking-form vehicle-form" onSubmit={event => { event.preventDefault(); if (!validPlate(vehicle.plate)) { setError('Enter a valid plate (2–15 characters).'); return } mutate(() => supabase.rpc('parking_save_permit', { p_lot: lotId, p_vehicle: vehicle.id || null, p_plate: normalizePlate(vehicle.plate), p_owner: vehicle.owner_name, p_expires: vehicle.permit_expires, p_active: vehicle.active, p_email: vehicle.driver_email }), vehicle.id ? 'Permit updated. The previous permit details have been replaced.' : 'Vehicle permit saved.', () => setVehicle(initialVehicle)) }}><label>License plate<input required maxLength={15} value={vehicle.plate} onChange={event => setVehicle({ ...vehicle, plate: event.target.value.toUpperCase() })} /></label><label>Resident / owner<input required maxLength={100} value={vehicle.owner_name} onChange={event => setVehicle({ ...vehicle, owner_name: event.target.value })} /></label><label>Permit expires<input required type="date" value={vehicle.permit_expires} onChange={event => setVehicle({ ...vehicle, permit_expires: event.target.value })} /></label><label>Driver account email<input type="email" value={vehicle.driver_email || ''} onChange={event => setVehicle({ ...vehicle, driver_email: event.target.value })} placeholder="Confirmed account email (optional)" /></label><label>Permit status<select value={String(vehicle.active)} onChange={event => setVehicle({ ...vehicle, active: event.target.value === 'true' })}><option value="true">Active</option><option value="false">Inactive</option></select></label><button className="button primary" disabled={busy}>{vehicle.id ? 'Save changes' : 'Save permit'}</button><button type="button" className="text-action" disabled={busy} onClick={() => setVehicle(initialVehicle)}>{vehicle.id ? 'Cancel edit' : 'Clear'}</button></form><p className="review-hint">{vehicle.id ? 'Saving replaces this permit, including its old plate if changed. Changes to the plate, account or permit validity may cancel affected upcoming bookings.' : 'To change a permit, choose Edit permit on its row. Each registered plate has one current permit per lot.'}</p></section>}
          <section className="panel"><div className="panel-heading"><h2>Registered vehicles</h2><input className="parking-search" aria-label="Search vehicles" placeholder="Search plate or owner…" value={search} onChange={event => setSearch(event.target.value)} /></div><div className="table-scroll"><table><thead><tr><th>Plate</th><th>Owner</th><th>Driver account</th><th>Expiry (UTC)</th><th>Status</th>{admin && <th>Action</th>}</tr></thead><tbody>{vehicles.filter(item => `${item.plate} ${item.owner_name}`.toLowerCase().includes(search.toLowerCase())).map(item => <tr key={item.id}><td><strong className="table-plate">{item.plate}</strong></td><td>{item.owner_name}</td><td>{item.owner_user_id ? (members.find(member => member.user_id === item.owner_user_id)?.email || 'Linked account') : 'Not linked'}</td><td>{item.permit_expires}</td><td><span className={`permit-badge ${permitStatus(item) === 'Valid permit' ? 'valid' : ''}`}>{permitStatus(item)}</span></td>{admin && <td><button className="text-action" disabled={busy} onClick={() => { setVehicle({ ...item, driver_email: members.find(member => member.user_id === item.owner_user_id)?.email || '' }); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>Edit permit</button><button className="text-action danger-text" disabled={busy} onClick={() => { setError(''); setDeleteVehicle(item) }}>Delete permit</button></td>}</tr>)}</tbody></table></div>{!vehicles.length && <p className="parking-empty">No vehicles registered yet.</p>}</section>
        </>}
        {page === 'Check permit' && admin && <PermitChecker key={lotId} userId={userId} lot={lot} />}
        {page === 'Park now' && !admin && <DriverParking key={`${lotId}-${pendingReservation?.id || 'walkin'}`} userId={userId} lot={lot} vehicles={vehicles} sessions={sessions} spots={spots} reservations={reservations} initialReservation={pendingReservation} busy={busy} mutate={mutate} />}
        {page === 'Reservations' && <Reservations key={lotId} userId={userId} lot={lot} vehicles={vehicles} reservations={reservations} busy={busy} mutate={mutate} operator={operator} onCheckIn={reservation => { if (admin) { setReview(reservation.plate); setDirection('entry'); setSelectedSpot(reservation.spot_id); setUntil(localDateTime(reservation.ends_at)); setPendingReservation(reservation); setPage('Entry / Exit') } else { setPendingReservation(reservation); setPage('Park now') } }} />}
        {page === 'Parking spots' && <>
          <div className="parking-page-title"><h1>Parking spots<span>.</span></h1><p>Each space has a permanent ID within this lot. Availability updates after recorded entries and exits.</p></div>
          <div className="spot-legend"><span><i className="spot-available-dot" />Available</span><span><i className="spot-occupied-dot" />Occupied</span><strong>{availableSpots.length} available / {lot.capacity} total</strong></div>
          <section className="spot-grid" aria-label="Parking spots">{spots.filter(item => item.active).map(item => <article key={item.id} className={`spot-card ${item.occupied ? 'occupied' : 'available'}`}><strong>{item.label}</strong><span>{item.occupied ? 'Occupied' : 'Available'}</span>{operator && item.occupied && <small>{open.find(session => session.spot_id === item.id)?.plate}</small>}</article>)}</section>
          <p className="privacy-note">Match these spot IDs to the labels on your physical spaces. Availability is based on recorded entries and exits.</p>
        </>}
        {page === 'History' && <>
          <div className="parking-page-title"><h1>Parking history<span>.</span></h1><p>{operator ? 'Shared entry and exit records for this lot, newest entries first.' : 'Your entry and exit records, including the spot used for each visit.'}</p></div><section className="panel"><div className="panel-heading"><h2>Parking sessions · Page {historyPage + 1}</h2><button className="text-action" disabled={!history.length || historyLoading} onClick={exportHistory}>Export this page as CSV</button></div>{historyLoading ? <p className="parking-empty" role="status">Loading history…</p> : <SessionTable rows={history} />}<div className="history-pagination"><button className="button secondary subtle" disabled={historyLoading || historyPage === 0} onClick={() => loadHistory(historyPage - 1)}>Previous</button><button className="button secondary subtle" disabled={historyLoading || !historyMore} onClick={() => loadHistory(historyPage + 1)}>Next</button></div></section>
        </>}
        {page === 'Settings' && admin && <>
          <div className="parking-page-title"><h1>Lot settings<span>.</span></h1><p>Manage capacity and staff access.</p></div>
          <section className="panel parking-edit"><h2>Parking lot</h2><form key={lot.id + lot.name + lot.capacity} className="parking-form" onSubmit={event => { event.preventDefault(); const form = new FormData(event.currentTarget); mutate(() => supabase.rpc('parking_update_lot', { p_lot: lotId, p_name: form.get('name'), p_capacity: Number(form.get('capacity')) }), 'Lot settings updated.') }}><label>Lot name<input name="name" defaultValue={lot.name} required maxLength={100} /></label><label>Total spaces<input name="capacity" type="number" defaultValue={lot.capacity} required min={Math.max(1, open.length)} max="100000" /></label><button className="button primary" disabled={busy}>Save settings</button></form></section>
          <section className="panel parking-edit"><h2>Create another lot</h2><form className="parking-form" onSubmit={event => { event.preventDefault(); mutate(() => supabase.rpc('parking_create_lot', { p_name: name, p_capacity: Number(capacity) }), 'Parking lot created. Select it in the lot selector above.', () => setName('')) }}><label>New lot name<input required maxLength={100} value={name} onChange={event => setName(event.target.value)} /></label><label>New lot capacity<input required type="number" min="1" max="100000" value={capacity} onChange={event => setCapacity(event.target.value)} /></label><button className="button primary" disabled={busy}>Create parking lot</button></form></section>
          <section className="panel parking-edit"><h2>Staff access</h2><p className="review-hint">Staff can view permits and history, approve visitors, and check vehicles in or out. Only administrators can change permits, capacity, or staff access.</p><form className="parking-form" onSubmit={event => { event.preventDefault(); mutate(() => supabase.rpc('parking_add_staff', { p_lot: lotId, p_email: staffEmail }), 'Staff access granted.', () => setStaffEmail('')) }}><label>Existing account email<input type="email" required value={staffEmail} onChange={event => setStaffEmail(event.target.value)} placeholder="staff@example.com" /></label><button className="button primary" disabled={busy}>Add staff member</button></form><p className="review-hint">They must create and confirm their account first. Ask them to refresh after you add them.</p><ul className="member-list">{members.map(item => <li key={item.user_id}><span>{item.user_id === userId ? 'You' : item.email || `Account ${item.user_id}`} <small>· {item.role}</small></span>{item.role === 'staff' && <button disabled={busy} className="text-action" onClick={() => mutate(() => supabase.rpc('parking_remove_staff', { p_lot: lotId, p_user: item.user_id }), 'Staff access removed. Linked drivers retain their own parking access.')}>Remove staff access</button>}</li>)}</ul></section>
        </>}
      </>}
      </>}
      {deleteVehicle && admin && <DeletePermitDialog vehicle={deleteVehicle} busy={busy} error={error} onCancel={() => setDeleteVehicle(null)} onDelete={() => mutate(() => supabase.rpc('parking_delete_permit', { p_lot: lotId, p_vehicle: deleteVehicle.id }), 'Permit deleted. Upcoming reservations for that plate were cancelled.', () => { if (vehicle.id === deleteVehicle.id) setVehicle(initialVehicle); setDeleteVehicle(null) })} />}
      <footer><span>SmartPark / Parking management</span><span>Confirm every plate before recording</span></footer>
    </main>
  </div>
}
