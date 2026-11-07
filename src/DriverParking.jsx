import { useClock } from './useClock'
import { useState } from 'react'
import { supabase } from '../utils/supabase'
import Scanner from './App.jsx'
import { duration, normalizePlate, permitStatus } from './parking'
import { localDateTime } from './navigation'

export default function DriverParking({ userId, lot, vehicles, sessions, spots, reservations = [], initialReservation = null, busy, mutate }) {
  const now = useClock()
  const [direction, setDirection] = useState('entry')
  const [plate, setPlate] = useState(initialReservation?.plate || '')
  const [spotId, setSpotId] = useState(initialReservation?.spot_id || '')
  const [reservationId, setReservationId] = useState(initialReservation?.id || '')
  const [until, setUntil] = useState(() => localDateTime(initialReservation?.ends_at || Date.now() + 3600000))
  const [scannerVersion, setScannerVersion] = useState(0)
  const ownVehicles = vehicles.filter(item => item.owner_user_id === userId)
  const current = sessions.filter(item => !item.exit_at && item.driver_user_id === userId)
  const vehicle = ownVehicles.find(item => item.plate === plate)
  const session = current.find(item => item.plate === plate)
  const spot = spots.find(item => item.id === spotId && item.active && !item.occupied)
  const booking = reservations.find(item => item.id === reservationId && item.status === 'booked')
  const available = spots.filter(item => item.active && !item.occupied)

  function reviewPlate(value) {
    const normalized = normalizePlate(value)
    if (direction === 'entry' && !ownVehicles.some(item => item.plate === normalized)) throw new Error('This plate is not linked to your account. Ask the parking administrator to link it first.')
    if (direction === 'exit' && !current.some(item => item.plate === normalized)) throw new Error('There is no open session for your account and this plate.')
    const ready = reservations.find(item => item.plate === normalized && item.user_id === userId && item.status === 'booked' && new Date(item.starts_at) <= new Date() && new Date(item.ends_at) > new Date())
    setPlate(normalized); setSpotId(ready?.spot_id || ''); setReservationId(ready?.id || '')
    if (ready) setUntil(localDateTime(ready.ends_at))
  }

  return <>
    <section className="page-heading"><div><p className="eyebrow">SELF-SERVICE PARKING</p><h1>Park now<span>.</span></h1><p>Scan your plate, select your spot, and confirm your arrival or departure at {lot.name}.</p></div><span className="step-pill">{available.length} SPOTS AVAILABLE</span></section>
    <div className="driver-summary">
      <section className="panel parking-edit"><h2>My vehicles</h2>{ownVehicles.length ? <ul className="driver-vehicle-list">{ownVehicles.map(item => <li key={item.id}><strong className="table-plate">{item.plate}</strong><span className={`permit-badge ${permitStatus(item) === 'Valid permit' ? 'valid' : ''}`}>{permitStatus(item)}</span><small>Expires {item.permit_expires} (UTC)</small></li>)}</ul> : <p className="review-hint">No vehicles are linked to your account. Ask the parking administrator to add your confirmed account email to your vehicle permit.</p>}</section>
      <section className="panel parking-edit"><h2>Currently parked</h2>{current.length ? <ul className="driver-vehicle-list">{current.map(item => <li key={item.id}><strong className="table-plate">{item.plate}</strong><span className="spot-tag">{item.spot_label || 'Legacy session'}</span><small>{duration(item.entry_at)} parked</small><button className="text-action" disabled={busy} onClick={() => { setDirection('exit'); setPlate(item.plate); setSpotId('') }}>Review checkout</button></li>)}</ul> : <p className="review-hint">You have no open parking sessions.</p>}</section>
    </div>
    <div className="direction-switch" aria-label="My parking action">{['entry','exit'].map(value => <button key={value} disabled={busy} aria-pressed={direction === value} onClick={() => { setDirection(value); setPlate(''); setSpotId(''); setReservationId('') }}>{value === 'entry' ? '↓ My arrival' : '↑ My departure'}</button>)}</div>
    {plate && <section className="panel admission-panel" aria-labelledby="my-confirm-title">
      <h2 id="my-confirm-title">Confirm my {direction === 'entry' ? 'arrival' : 'departure'} · <span className="table-plate">{plate}</span></h2>
      {direction === 'entry' ? <>
        <p>{vehicle ? `${permitStatus(vehicle)} · ${vehicle.owner_name}` : 'This plate is no longer linked to your account.'}</p>
        {session && <p className="error">This vehicle is already checked in at {session.spot_label}.</p>}
        {permitStatus(vehicle) !== 'Valid permit' && <p className="error">A valid permit is required. Ask staff to renew your permit or approve a visitor entry.</p>}
        <label className="visitor-reason">Choose your parking spot<select aria-label="Choose your parking spot" value={spot ? spotId : ''} disabled={busy} onChange={event => { setSpotId(event.target.value); if (event.target.value !== booking?.spot_id) setReservationId('') }}><option value="">Select an available spot</option>{available.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
        {booking && <p className="notice">Using your reservation for {booking.spot_label}, until {new Date(booking.ends_at).toLocaleString()}.</p>}
        <label className="visitor-reason">Expected departure<input type="datetime-local" required disabled={busy} value={until} onChange={event => setUntil(event.target.value)} max={booking ? localDateTime(booking.ends_at) : undefined} /></label>
        {!available.length && <p className="error">No spots are currently available.</p>}
        <p className="privacy-note">Choose the ID displayed on the physical space you are using. A scan alone does not confirm your location.</p>
      </> : <p>{session ? `Spot ${session.spot_label || 'unassigned'} · Arrived ${new Date(session.entry_at).toLocaleString()} · ${duration(session.entry_at)} parked` : 'No open session found for your account. Refresh to update your records.'}</p>}
      <div className="admission-actions"><button className="button primary" disabled={busy || (direction === 'entry' ? !until || new Date(until).getTime() <= now || !spot || !vehicle || Boolean(session) || permitStatus(vehicle) !== 'Valid permit' : !session)} onClick={() => mutate(() => supabase.rpc(direction === 'entry' ? 'parking_start_visit' : 'parking_check_out', { p_lot: lot.id, p_plate: plate, ...(direction === 'entry' ? { p_spot: spotId, p_until: new Date(until).toISOString(), p_reservation: booking?.id || null, p_visitor_reason: null } : {}) }), direction === 'entry' ? `${plate} checked in at ${spot.label}.` : `${plate} checked out. Your spot is now available.`, () => { setPlate(''); setSpotId(''); setReservationId(''); setScannerVersion(value => value + 1) })}>{busy ? 'Saving…' : direction === 'entry' ? 'Confirm my entry' : 'Confirm my exit'}</button><button className="button secondary subtle" disabled={busy} onClick={() => setPlate('')}>Cancel</button></div>
    </section>}
    <details className="spot-preview"><summary>View parking spots · {available.length} available now</summary><div className="spot-grid">{spots.filter(item => item.active).map(item => <article key={item.id} className={`spot-card ${item.occupied ? 'occupied' : 'available'}`}><strong>{item.label}</strong><span>{item.occupied ? 'Occupied' : 'Available now'}</span></article>)}</div></details>
    <fieldset className="embedded-scanner" disabled={busy}><Scanner key={scannerVersion} userId={userId} onRecord={reviewPlate} /></fieldset>
    <p className="privacy-note">Your history is linked to your signed-in account. Confirm the plate and spot before saving; photos are not stored.</p>
  </>
}
