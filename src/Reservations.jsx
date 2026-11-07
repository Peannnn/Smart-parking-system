import { useClock } from './useClock'
import { useRef, useState } from 'react'
import { supabase } from '../utils/supabase'
import { localDateTime } from './navigation'

export default function Reservations({ userId, lot, vehicles, reservations, busy, mutate, operator, onCheckIn }) {
  const [plate, setPlate] = useState('')
  const [start, setStart] = useState(() => localDateTime(Date.now() + 3600000))
  const [end, setEnd] = useState(() => localDateTime(Date.now() + 7200000))
  const [spotId, setSpotId] = useState('')
  const [available, setAvailable] = useState([])
  const [searched, setSearched] = useState('')
  const [finding, setFinding] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(0)
  const ownVehicles = vehicles.filter(item => item.owner_user_id === userId)
  const key = `${start}|${end}`
  const currentSearch = searched === key
  const now = useClock()
  const sorted = [...reservations].sort((a,b) => new Date(b.starts_at) - new Date(a.starts_at))
  const [offset, setOffset] = useState(0)
  const rows = sorted.slice(offset * 25, offset * 25 + 25)

  async function findSpots(event) {
    event.preventDefault()
    if (!start || !end || new Date(start) <= new Date() || new Date(end) <= new Date(start)) { setError('Choose a future arrival time and a later departure time.'); return }
    const id = ++request.current
    setFinding(true); setError(''); setSearched(''); setSpotId('')
    try {
      const spots = []
      for (let from = 0; ; from += 500) {
        const { data, error } = await supabase.rpc('parking_reservation_spots', { p_lot: lot.id, p_start: new Date(start).toISOString(), p_end: new Date(end).toISOString() }).order('number').range(from, from + 499)
        if (error) throw error
        spots.push(...data)
        if (data.length < 500) break
      }
      if (id === request.current) { setAvailable(spots); setSearched(key) }
    } catch (error) { if (id === request.current) setError(error.message) }
    finally { if (id === request.current) setFinding(false) }
  }

  return <>
    <div className="parking-page-title"><h1>Reservations<span>.</span></h1><p>Schedule a parking spot for your linked vehicle. Times below use your device’s time zone.</p></div>
    <section className="panel parking-edit"><h2>Schedule parking</h2>
      {!ownVehicles.length ? <p className="review-hint">Ask your parking administrator to link your account to a vehicle before making a reservation.</p> : <>
        <form className="parking-form" onSubmit={findSpots}>
          <label>My vehicle<select aria-label="My vehicle" required disabled={busy || finding} value={plate} onChange={event => setPlate(event.target.value)}><option value="">Select your plate</option>{ownVehicles.map(item => <option key={item.id} value={item.plate}>{item.plate}</option>)}</select></label>
          <label>Arrival<input type="datetime-local" required disabled={busy || finding} value={start} onChange={event => setStart(event.target.value)} /></label>
          <label>Departure<input type="datetime-local" required disabled={busy || finding} value={end} onChange={event => setEnd(event.target.value)} /></label>
          <button className="button primary" disabled={busy || finding}>{finding ? 'Finding spots…' : 'Find available spots'}</button>
        </form>
        {currentSearch && <div className="reservation-book"><label className="visitor-reason">Available spot<select aria-label="Available spot" disabled={busy} value={spotId} onChange={event => setSpotId(event.target.value)}><option value="">Choose a spot</option>{available.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>{!available.length && <p className="review-hint">No spots are available for this time. Try different arrival or departure times.</p>}<button className="button primary" disabled={busy || !spotId || !plate || !available.some(item => item.id === spotId)} onClick={() => mutate(() => supabase.rpc('parking_reserve', { p_lot: lot.id, p_plate: plate, p_spot: spotId, p_start: new Date(start).toISOString(), p_end: new Date(end).toISOString() }), 'Your parking reservation is confirmed.', () => { setSearched(''); setSpotId(''); setOffset(0) })}>Confirm reservation</button></div>}
      </>}
      {error && <p className="error" role="alert">{error}</p>}
      <p className="review-hint">A reservation holds the space for the selected time. Record your entry on arrival and check out before departure. If a previous driver overstays, contact staff.</p>
    </section>
    <section className="panel"><div className="panel-heading"><h2>{operator ? 'Lot reservations' : 'My reservations'}</h2></div>
      {rows.length ? <div className="table-scroll"><table><thead><tr><th>Plate</th><th>Spot</th><th>Arrival</th><th>Departure</th><th>Status</th><th>Actions</th></tr></thead><tbody>{rows.map(item => {
        const expired = item.status === 'booked' && new Date(item.ends_at).getTime() <= now
        const ready = item.status === 'booked' && !expired && new Date(item.starts_at).getTime() <= now
        return <tr key={item.id}><td><strong className="table-plate">{item.plate}</strong></td><td><span className="spot-tag">{item.spot_label}</span></td><td>{new Date(item.starts_at).toLocaleString()}</td><td>{new Date(item.ends_at).toLocaleString()}</td><td>{expired ? 'Expired' : item.status === 'checked_in' ? 'Used' : item.status === 'booked' ? 'Confirmed' : 'Cancelled'}</td><td><div className="reservation-actions">{ready && item.user_id === userId && <button className="text-action" disabled={busy} onClick={() => onCheckIn(item)}>Check in reservation</button>}{item.status === 'booked' && !expired && <button className="text-action" disabled={busy} onClick={() => mutate(() => supabase.rpc('parking_cancel_reservation', { p_reservation: item.id }), 'Reservation cancelled. The spot is available to book again.')}>Cancel reservation</button>}</div></td></tr>
      })}</tbody></table></div> : <p className="parking-empty">No reservations yet. Book your next visit above.</p>}
      {sorted.length > 25 && <div className="history-pagination"><button className="button secondary subtle" disabled={offset === 0 || busy} onClick={() => setOffset(value => value - 1)}>Previous reservations</button><span>Page {offset + 1}</span><button className="button secondary subtle" disabled={(offset + 1) * 25 >= sorted.length || busy} onClick={() => setOffset(value => value + 1)}>Next reservations</button></div>}
    </section>
  </>
}
