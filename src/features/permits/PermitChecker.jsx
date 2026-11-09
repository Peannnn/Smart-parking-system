import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../services/supabase.js'
import Scanner from '../scanner/PlateScanner.jsx'
const labels = {
  valid: 'Valid permit',
  expired: 'Permit expired',
  inactive: 'Permit inactive',
  not_found: 'No permit found',
  unassigned: 'Spot not assigned',
}
export default function PermitChecker({ userId, lot }) {
  const [result, setResult] = useState(null)
  const [checking, setChecking] = useState(false)
  const sequence = useRef(0)
  useEffect(
    () => () => {
      sequence.current += 1
    },
    [],
  )
  async function check(plate) {
    const request = ++sequence.current
    setResult(null)
    setChecking(true)
    try {
      const { data, error } = await supabase.rpc('parking_check_permit', {
        p_lot: lot.id,
        p_plate: plate,
      })
      if (error) throw error
      if (!data || !labels[data.status])
        throw new Error('The permit check could not be completed. Please try again.')
      if (request === sequence.current) setResult(data)
      return 'Permit checked. See the result above.'
    } finally {
      if (request === sequence.current) setChecking(false)
    }
  }
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">PERMIT VERIFICATION</p>
          <h1>
            Check permit<span>.</span>
          </h1>
          <p>Scan or enter a license plate to check its current permit at {lot.name}.</p>
        </div>
        <span className="step-pill">PERMIT LOOKUP</span>
      </section>
      {checking && (
        <p className="parking-empty" role="status">
          Checking the current permit…
        </p>
      )}
      {result && (
        <section
          className={`panel permit-result ${result.status === 'valid' ? 'permit-result-valid' : 'permit-result-warning'}`}
          aria-live="polite"
          aria-labelledby="permit-result-title"
        >
          <div>
            <span className="table-plate">{result.plate}</span>
            <h2 id="permit-result-title">{labels[result.status]}</h2>
          </div>
          <p>
            {result.status === 'valid'
              ? 'This vehicle has an active permit for this lot.'
              : result.status === 'expired'
                ? 'This vehicle’s permit has expired.'
                : result.status === 'inactive'
                  ? 'This vehicle’s permit is inactive.'
                  : result.status === 'unassigned'
                    ? 'Assign an active parking spot to this permit before check-in.'
                    : 'No registered permit matches this plate in this lot.'}
          </p>
          {result.owner_name && (
            <dl>
              <div>
                <dt>Owner</dt>
                <dd>{result.owner_name}</dd>
              </div>
              <div>
                <dt>Expires (UTC)</dt>
                <dd>{result.permit_expires}</dd>
              </div>
              <div>
                <dt>Assigned spot</dt>
                <dd>{result.assigned_spot_label || 'Not assigned'}</dd>
              </div>
            </dl>
          )}
          <small>Checked {new Date(result.checked_at).toLocaleString()}</small>
        </section>
      )}
      <div className="embedded-scanner">
        <Scanner userId={userId} onRecord={check} permitCheck />
      </div>
    </>
  )
}
