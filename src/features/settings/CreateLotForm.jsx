import { supabase } from '../../services/supabase.js'
export default function CreateLotForm({ mutate, name, capacity, setName, setCapacity, busy }) {
  return (
    <section className="panel parking-edit">
      <h2>Create another lot</h2>
      <form
        className="parking-form"
        onSubmit={(event) => {
          event.preventDefault()
          mutate(
            () =>
              supabase.rpc('parking_create_lot', {
                p_name: name,
                p_capacity: Number(capacity),
              }),
            'Parking lot created. Select it in the lot selector above.',
            () => setName(''),
          )
        }}
      >
        <label>
          New lot name
          <input
            required
            maxLength={100}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          New lot capacity
          <input
            required
            type="number"
            min="1"
            max="100000"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </label>
        <button className="button primary" disabled={busy}>
          Create parking lot
        </button>
      </form>
    </section>
  )
}
