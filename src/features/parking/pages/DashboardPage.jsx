import { permitStatus } from '../../../shared/parkingFormatters.js'
import SessionTable from '../components/SessionTable.jsx'
export default function DashboardPage({
  lot,
  setPage,
  open,
  spots,
  vehicles,
  search,
  setSearch,
  busy,
  setDirection,
  reviewPlate,
}) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">LIVE PARKING OVERVIEW</p>
          <h1>
            {lot.name}
            <span>.</span>
          </h1>
          <p>Manage arrivals, departures, and permits in one place.</p>
        </div>
        <button className="button secondary" onClick={() => setPage('Entry / Exit')}>
          Record entry or exit →
        </button>
      </section>
      <div className="parking-stats">
        <article>
          <span>Vacant spaces</span>
          <strong>{Math.max(0, lot.capacity - open.length)}</strong>
          <small>of {lot.capacity} total spaces</small>
        </article>
        <article>
          <span>Currently parked</span>
          <strong>{open.length}</strong>
          <small>{Math.round((open.length / lot.capacity) * 100)}% occupancy</small>
        </article>
        <article>
          <span>Assigned spaces</span>
          <strong>{spots.filter((item) => item.active && item.assigned_vehicle_id).length}</strong>
          <small>Dedicated to vehicle permits</small>
        </article>
        <article>
          <span>Permits needing attention</span>
          <strong>
            {
              vehicles.filter(
                (item) => permitStatus(item) !== 'Valid permit' || !item.assigned_spot_id,
              ).length
            }
          </strong>
          <small>Expired, inactive, or unassigned</small>
        </article>
      </div>
      {open.length >= lot.capacity && (
        <p className="parking-alert" role="status">
          Lot full. Check out a vehicle before admitting another.
        </p>
      )}
      <section className="panel">
        <div className="panel-heading">
          <h2>Currently parked</h2>
          <input
            className="parking-search"
            aria-label="Search parked plates"
            placeholder="Search plate…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <SessionTable
          rows={open.filter((item) => item.plate.includes(search.toUpperCase()))}
          checkout
          busy={busy}
          onCheckout={(plate) => {
            setDirection('exit')
            reviewPlate(plate)
            setPage('Entry / Exit')
          }}
        />
      </section>
      <p className="privacy-note">
        Updates every 15 seconds. Occupancy is based on recorded check-ins and checkouts, not
        sensors. Vacant assigned spots remain dedicated to their permits.
      </p>
    </>
  )
}
