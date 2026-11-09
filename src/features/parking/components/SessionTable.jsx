import { duration } from '../../../shared/parkingFormatters.js'
import { formatTime } from '../../../shared/parkingFormatters.js'
export default function SessionTable({ rows, checkout = false, busy = false, onCheckout }) {
  return rows.length ? (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Plate</th>
            <th>Spot ID</th>
            <th>Entry</th>
            <th>{checkout ? 'Time parked' : 'Exit'}</th>
            <th>Admission</th>
            {checkout && <th>Action</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((item) => (
            <tr key={item.id}>
              <td>
                <strong className="table-plate">{item.plate}</strong>
              </td>
              <td>
                <span className="spot-tag">{item.spot_label || 'Legacy / unassigned'}</span>
              </td>
              <td>{formatTime(item.entry_at)}</td>
              <td>
                {checkout ? (
                  duration(item.entry_at)
                ) : (
                  <>
                    {formatTime(item.exit_at)}
                    {item.exit_at && (
                      <small className="duration-label">
                        {duration(item.entry_at, item.exit_at)}
                      </small>
                    )}
                  </>
                )}
              </td>
              <td>
                <span className="source-label">{item.admission}</span>
                {item.visitor_reason && (
                  <small className="duration-label">{item.visitor_reason}</small>
                )}
              </td>
              {checkout && (
                <td>
                  <button
                    className="text-action"
                    disabled={busy}
                    onClick={() => onCheckout(item.plate)}
                  >
                    Check out
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  ) : (
    <p className="parking-empty">No parking sessions to show.</p>
  )
}
