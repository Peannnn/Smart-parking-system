export default function SpotsPage({ vacantSpots, lot, spots, operator, open }) {
  return (
    <>
      <div className="parking-page-title">
        <h1>
          Parking spots<span>.</span>
        </h1>
        <p>
          Each space has a permanent ID within this lot. Permits hold assignments; recorded entries
          and exits determine occupancy.
        </p>
      </div>
      <div className="spot-legend">
        <span>
          <i className="spot-available-dot" />
          Vacant
        </span>
        <span>
          <i className="spot-occupied-dot" />
          Occupied
        </span>
        <strong>
          {vacantSpots.length} vacant / {lot.capacity} total
        </strong>
      </div>
      <section className="spot-grid" aria-label="Parking spots">
        {spots
          .filter((item) => item.active)
          .map((item) => (
            <article
              key={item.id}
              className={`spot-card ${item.occupied ? 'occupied' : item.assigned_vehicle_id ? 'assigned' : 'available'}`}
            >
              <strong>{item.label}</strong>
              <span>
                {item.occupied
                  ? 'Occupied'
                  : item.assigned_vehicle_id
                    ? 'Assigned · vacant'
                    : 'Unassigned · vacant'}
              </span>
              {item.assigned_plate && <small>Permit: {item.assigned_plate}</small>}
              {operator && item.occupied && (
                <small>{open.find((session) => session.spot_id === item.id)?.plate}</small>
              )}
            </article>
          ))}
      </section>
      <p className="privacy-note">
        Match these spot IDs to the labels on your physical spaces. Availability is based on
        recorded entries and exits.
      </p>
    </>
  )
}
