import { permitStatus } from '../../shared/parkingFormatters.js'
export default function PermitTable({
  search,
  setSearch,
  admin,
  vehicles,
  members,
  spots,
  busy,
  setVehicle,
  setError,
  setDeleteVehicle,
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>Registered vehicles</h2>
        <input
          className="parking-search"
          aria-label="Search vehicles"
          placeholder="Search plate or owner…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Plate</th>
              <th>Owner</th>
              <th>Driver account</th>
              <th>Assigned spot</th>
              <th>Expiry (UTC)</th>
              <th>Status</th>
              {admin && <th>Action</th>}
            </tr>
          </thead>
          <tbody>
            {vehicles
              .filter((item) =>
                `${item.plate} ${item.owner_name}`.toLowerCase().includes(search.toLowerCase()),
              )
              .map((item) => (
                <tr key={item.id}>
                  <td>
                    <strong className="table-plate">{item.plate}</strong>
                  </td>
                  <td>{item.owner_name}</td>
                  <td>
                    {item.owner_user_id
                      ? members.find((member) => member.user_id === item.owner_user_id)?.email ||
                        'Linked account'
                      : 'Not linked'}
                  </td>
                  <td>
                    <span className="spot-tag">
                      {spots.find((spot) => spot.id === item.assigned_spot_id)?.label ||
                        'Not assigned'}
                    </span>
                  </td>
                  <td>{item.permit_expires}</td>
                  <td>
                    <span
                      className={`permit-badge ${permitStatus(item) === 'Valid permit' ? 'valid' : ''}`}
                    >
                      {permitStatus(item)}
                    </span>
                  </td>
                  {admin && (
                    <td>
                      <button
                        className="text-action"
                        disabled={busy}
                        onClick={() => {
                          setVehicle({
                            ...item,
                            driver_email:
                              members.find((member) => member.user_id === item.owner_user_id)
                                ?.email || '',
                          })
                          window.scrollTo({
                            top: 0,
                            behavior: 'smooth',
                          })
                        }}
                      >
                        Edit permit
                      </button>
                      <button
                        className="text-action danger-text"
                        disabled={busy}
                        onClick={() => {
                          setError('')
                          setDeleteVehicle(item)
                        }}
                      >
                        Delete permit
                      </button>
                    </td>
                  )}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {!vehicles.length && <p className="parking-empty">No vehicles registered yet.</p>}
    </section>
  )
}
