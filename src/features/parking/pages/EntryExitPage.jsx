import { formatTime } from '../../../shared/parkingFormatters.js'
import { duration } from '../../../shared/parkingFormatters.js'
import { supabase } from '../../../services/supabase.js'
import Scanner from '../../scanner/PlateScanner.jsx'
export default function EntryExitPage({
  busy,
  direction,
  setDirection,
  setReview,
  review,
  matchingSession,
  status,
  matchingVehicle,
  reviewSpot,
  mutate,
  lotId,
  setScannerVersion,
  scannerVersion,
  userId,
  reviewPlate,
}) {
  return (
    <>
      <div className="parking-page-title">
        <h1>
          Entry & exit<span>.</span>
        </h1>
        <p>Scan or type a plate, then confirm the parking action.</p>
      </div>
      <div className="direction-switch" aria-label="Parking action">
        {['entry', 'exit'].map((value) => (
          <button
            disabled={busy}
            key={value}
            aria-pressed={direction === value}
            onClick={() => {
              setDirection(value)
              setReview(null)
            }}
          >
            {value === 'entry' ? '↓ Vehicle entry' : '↑ Vehicle exit'}
          </button>
        ))}
      </div>
      {review && (
        <section className="panel admission-panel" aria-labelledby="admission-title">
          <h2 id="admission-title">
            Confirm {direction === 'entry' ? 'entry' : 'exit'} ·{' '}
            <span className="table-plate">{review}</span>
          </h2>
          <p>
            {direction === 'exit'
              ? matchingSession
                ? `Spot ${matchingSession.spot_label || 'unassigned'} · Checked in ${formatTime(matchingSession.entry_at)} · ${duration(matchingSession.entry_at)} parked`
                : 'No open parking session found. Refresh if another staff member recently checked this vehicle in.'
              : `${status}${matchingVehicle ? ` · ${matchingVehicle.owner_name} · expires ${matchingVehicle.permit_expires} (UTC)` : ''}`}
          </p>
          {direction === 'entry' && (
            <p className="assigned-spot-info">
              Assigned spot: <strong>{reviewSpot?.label || 'Not assigned'}</strong>
            </p>
          )}
          {direction === 'entry' && (!reviewSpot?.active || status !== 'Valid permit') && (
            <p className="error">
              A valid permit and active spot assignment are required. Update the vehicle permit
              first.
            </p>
          )}
          {direction === 'entry' && matchingSession && (
            <p className="error">This vehicle is already checked in.</p>
          )}
          {direction === 'entry' && reviewSpot?.occupied && !matchingSession && (
            <p className="error">The assigned spot is occupied.</p>
          )}
          <div className="admission-actions">
            <button
              className="button primary"
              disabled={
                busy ||
                (direction === 'entry'
                  ? !reviewSpot?.active ||
                    reviewSpot.occupied ||
                    Boolean(matchingSession) ||
                    status !== 'Valid permit'
                  : !matchingSession)
              }
              onClick={() =>
                mutate(
                  () =>
                    supabase.rpc(
                      direction === 'entry' ? 'parking_check_in_assigned' : 'parking_check_out',
                      {
                        p_lot: lotId,
                        p_plate: review,
                      },
                    ),
                  `${review} checked ${direction === 'entry' ? 'in' : 'out'} successfully.`,
                  () => {
                    setReview(null)
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
              onClick={() => setReview(null)}
            >
              Cancel
            </button>
          </div>
        </section>
      )}
      <fieldset className="embedded-scanner" disabled={busy}>
        <Scanner key={`${lotId}-${scannerVersion}`} userId={userId} onRecord={reviewPlate} />
      </fieldset>
    </>
  )
}
