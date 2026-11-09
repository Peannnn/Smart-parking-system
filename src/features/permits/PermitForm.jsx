import { validPlate, normalizePlate } from '../../shared/parkingFormatters.js'
import { supabase } from '../../services/supabase.js'
import { initialVehicle } from '../parking/parkingConstants.js'
export default function PermitForm({
  vehicle,
  vehicles,
  setError,
  mutate,
  lotId,
  setVehicle,
  assignableSpots,
  busy,
}) {
  return (
    <section className="panel parking-edit">
      <h2>
        {vehicle.id
          ? `Edit permit · ${vehicles.find((item) => item.id === vehicle.id)?.plate || vehicle.plate}`
          : 'Register a vehicle'}
      </h2>
      <form
        className="parking-form vehicle-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!validPlate(vehicle.plate)) {
            setError('Enter a valid plate (2–15 characters).')
            return
          }
          mutate(
            () =>
              supabase.rpc('parking_save_permit_assigned', {
                p_lot: lotId,
                p_vehicle: vehicle.id || null,
                p_plate: normalizePlate(vehicle.plate),
                p_owner: vehicle.owner_name,
                p_expires: vehicle.permit_expires,
                p_active: vehicle.active,
                p_email: vehicle.driver_email,
                p_spot: vehicle.assigned_spot_id,
              }),
            vehicle.id
              ? 'Permit updated. The previous permit details have been replaced.'
              : 'Vehicle permit saved.',
            () => setVehicle(initialVehicle),
          )
        }}
      >
        <label>
          License plate
          <input
            required
            maxLength={15}
            value={vehicle.plate}
            onChange={(event) =>
              setVehicle({
                ...vehicle,
                plate: event.target.value.toUpperCase(),
              })
            }
          />
        </label>
        <label>
          Resident / owner
          <input
            required
            maxLength={100}
            value={vehicle.owner_name}
            onChange={(event) =>
              setVehicle({
                ...vehicle,
                owner_name: event.target.value,
              })
            }
          />
        </label>
        <label>
          Permit expires
          <input
            required
            type="date"
            value={vehicle.permit_expires}
            onChange={(event) =>
              setVehicle({
                ...vehicle,
                permit_expires: event.target.value,
              })
            }
          />
        </label>
        <label>
          Driver account email
          <input
            type="email"
            value={vehicle.driver_email || ''}
            onChange={(event) =>
              setVehicle({
                ...vehicle,
                driver_email: event.target.value,
              })
            }
            placeholder="Confirmed account email (optional)"
          />
        </label>
        <label>
          Assigned parking spot
          <select
            aria-label="Assigned parking spot"
            required
            value={vehicle.assigned_spot_id || ''}
            onChange={(event) =>
              setVehicle({
                ...vehicle,
                assigned_spot_id: event.target.value,
              })
            }
          >
            <option value="">Assign a spot</option>
            {assignableSpots.map((spot) => (
              <option key={spot.id} value={spot.id}>
                {spot.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Permit status
          <select
            value={String(vehicle.active)}
            onChange={(event) =>
              setVehicle({
                ...vehicle,
                active: event.target.value === 'true',
              })
            }
          >
            <option value="true">Active</option>
            <option value="false">Inactive</option>
          </select>
        </label>
        <button className="button primary" disabled={busy}>
          {vehicle.id ? 'Save changes' : 'Save permit'}
        </button>
        <button
          type="button"
          className="text-action"
          disabled={busy}
          onClick={() => setVehicle(initialVehicle)}
        >
          {vehicle.id ? 'Cancel edit' : 'Clear'}
        </button>
      </form>
      <p className="review-hint">
        {vehicle.id
          ? 'Saving replaces this permit, including its old plate if changed. Check out the vehicle before changing its plate, linked account, or assigned spot.'
          : 'To change a permit, choose Edit permit on its row. Assign an exclusive spot to each permit. A vacant assigned spot cannot be given to another permit.'}
      </p>
    </section>
  )
}
