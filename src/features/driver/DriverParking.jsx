import { useState } from 'react'
import { supabase } from '../../services/supabase.js'
import Scanner from '../scanner/PlateScanner.jsx'
import { duration, normalizePlate, permitStatus } from '../../shared/parkingFormatters.js'
export default function DriverParking({ userId, lot, vehicles, sessions, spots, busy, mutate }) {
  const [direction, setDirection] = useState('entry')
  const [plate, setPlate] = useState('')
  const [scannerVersion, setScannerVersion] = useState(0)
  const ownVehicles = vehicles.filter((item) => item.owner_user_id === userId)
  const current = sessions.filter((item) => !item.exit_at && item.driver_user_id === userId)
  const vehicle = ownVehicles.find((item) => item.plate === plate)
  const session = current.find((item) => item.plate === plate)
  const assignedSpot = spots.find((item) => item.id === vehicle?.assigned_spot_id)
  function reviewPlate(value) {
    const normalized = normalizePlate(value)
    if (direction === 'entry' && !ownVehicles.some((item) => item.plate === normalized))
      throw new Error(
        'This plate is not linked to your account. Contact the parking administrator.',
      )
    if (direction === 'exit' && !current.some((item) => item.plate === normalized))
      throw new Error('There is no open session for your account and this plate.')
    setPlate(normalized)
  }
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">YOUR ASSIGNED PARKING</p>
          <h1>
            Check in / out<span>.</span>
          </h1>
          <p>
            Scan your plate to record arrival or departure at {lot.name}. Your permit determines
            your parking spot.
          </p>
        </div>
        <span className="step-pill">ASSIGNED PARKING</span>
      </section>
      <div className="driver-summary">
        <section className="panel parking-edit">
          <h2>My permits & assigned spots</h2>
          {ownVehicles.length ? (
            <ul className="driver-vehicle-list">
              {ownVehicles.map((item) => (
                <li key={item.id}>
                  <strong className="table-plate">{item.plate}</strong>
                  <span className="spot-tag">
                    {spots.find((spot) => spot.id === item.assigned_spot_id)?.label ||
                      'Spot not assigned'}
                  </span>
                  <span
                    className={`permit-badge ${permitStatus(item) === 'Valid permit' && item.assigned_spot_id ? 'valid' : ''}`}
                  >
                    {permitStatus(item) === 'Valid permit' && !item.assigned_spot_id
                      ? 'Needs spot assignment'
                      : permitStatus(item)}
                  </span>
                  <small>Expires {item.permit_expires} (UTC)</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="review-hint">
              Ask your administrator to link your confirmed account email to a permit and assign you
              a spot.
            </p>
          )}
        </section>
        <section className="panel parking-edit">
          <h2>Currently parked</h2>
          {current.length ? (
            <ul className="driver-vehicle-list">
              {current.map((item) => (
                <li key={item.id}>
                  <strong className="table-plate">{item.plate}</strong>
                  <span className="spot-tag">{item.spot_label || 'Legacy session'}</span>
                  <small>{duration(item.entry_at)} parked</small>
                </li>
              ))}
            </ul>
          ) : (
            <p className="review-hint">You have no open parking sessions.</p>
          )}
        </section>
      </div>
      <div className="direction-switch" aria-label="Check-in or checkout">
        {['entry', 'exit'].map((value) => (
          <button
            key={value}
            disabled={busy}
            aria-pressed={direction === value}
            onClick={() => {
              setDirection(value)
              setPlate('')
              setScannerVersion((version) => version + 1)
            }}
          >
            {value === 'entry' ? '↓ Check in' : '↑ Check out'}
          </button>
        ))}
      </div>
      {plate && (
        <section className="panel admission-panel" aria-labelledby="my-confirm-title">
          <h2 id="my-confirm-title">
            Confirm {direction === 'entry' ? 'check-in' : 'checkout'} ·{' '}
            <span className="table-plate">{plate}</span>
          </h2>
          {direction === 'entry' ? (
            <>
              <p>
                {vehicle
                  ? `${permitStatus(vehicle)} · ${vehicle.owner_name}`
                  : 'This plate is no longer linked to your account.'}
              </p>
              <p>
                <strong>Assigned spot: {assignedSpot?.label || 'Not assigned'}</strong>
              </p>
              {!assignedSpot?.active && (
                <p className="error">
                  Your permit needs an active spot assignment. Contact the administrator.
                </p>
              )}
              {session && (
                <p className="error">This vehicle is already checked in at {session.spot_label}.</p>
              )}
              {assignedSpot?.occupied && !session && (
                <p className="error">
                  Your assigned spot is occupied. Contact staff before checking in.
                </p>
              )}
              {permitStatus(vehicle) !== 'Valid permit' && (
                <p className="error">
                  A valid active permit is required. Contact the administrator.
                </p>
              )}
            </>
          ) : (
            <p>
              {session
                ? `Spot ${session.spot_label || 'unassigned'} · Arrived ${new Date(session.entry_at).toLocaleString()} · ${duration(session.entry_at)} parked`
                : 'No open session found for your account. Refresh to update your records.'}
            </p>
          )}
          <div className="admission-actions">
            <button
              className="button primary"
              disabled={
                busy ||
                (direction === 'entry'
                  ? !assignedSpot?.active ||
                    assignedSpot.occupied ||
                    !vehicle ||
                    Boolean(session) ||
                    permitStatus(vehicle) !== 'Valid permit'
                  : !session)
              }
              onClick={() =>
                mutate(
                  () =>
                    supabase.rpc(
                      direction === 'entry' ? 'parking_check_in_assigned' : 'parking_check_out',
                      {
                        p_lot: lot.id,
                        p_plate: plate,
                      },
                    ),
                  direction === 'entry'
                    ? `${plate} checked in at ${assignedSpot.label}.`
                    : `${plate} checked out. Your assigned spot is now vacant.`,
                  () => {
                    setPlate('')
                    setScannerVersion((value) => value + 1)
                  },
                )
              }
            >
              {busy ? 'Saving…' : direction === 'entry' ? 'Confirm check-in' : 'Confirm checkout'}
            </button>
            <button
              className="button secondary subtle"
              disabled={busy}
              onClick={() => setPlate('')}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      <fieldset className="embedded-scanner" disabled={busy}>
        <Scanner key={scannerVersion} userId={userId} onRecord={reviewPlate} requirePhoto />
      </fieldset>
      <p className="privacy-note">
        Scan and review your plate before confirming. Checking out marks your spot vacant; it
        remains assigned to your permit.
      </p>
    </>
  )
}
