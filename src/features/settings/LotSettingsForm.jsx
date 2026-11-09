import { supabase } from '../../services/supabase.js'
export default function LotSettingsForm({ lot, mutate, lotId, open, busy }) {
  return (
    <section className="panel parking-edit">
      <h2>Parking lot</h2>
      <form
        key={lot.id + lot.name + lot.capacity}
        className="parking-form"
        onSubmit={(event) => {
          event.preventDefault()
          const form = new FormData(event.currentTarget)
          mutate(
            () =>
              supabase.rpc('parking_update_lot', {
                p_lot: lotId,
                p_name: form.get('name'),
                p_capacity: Number(form.get('capacity')),
              }),
            'Lot settings updated.',
          )
        }}
      >
        <label>
          Lot name
          <input name="name" defaultValue={lot.name} required maxLength={100} />
        </label>
        <label>
          Total spaces
          <input
            name="capacity"
            type="number"
            defaultValue={lot.capacity}
            required
            min={Math.max(1, open.length)}
            max="100000"
          />
        </label>
        <button className="button primary" disabled={busy}>
          Save settings
        </button>
      </form>
    </section>
  )
}
