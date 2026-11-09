import { supabase } from '../../services/supabase.js'
export default function StaffAccessPanel({
  mutate,
  lotId,
  staffEmail,
  setStaffEmail,
  busy,
  members,
  userId,
}) {
  return (
    <section className="panel parking-edit">
      <h2>Staff access</h2>
      <p className="review-hint">
        Staff can view permits and history and check vehicles in or out of their assigned spots.
        Only administrators can change permits, capacity, or staff access.
      </p>
      <form
        className="parking-form"
        onSubmit={(event) => {
          event.preventDefault()
          mutate(
            () =>
              supabase.rpc('parking_add_staff', {
                p_lot: lotId,
                p_email: staffEmail,
              }),
            'Staff access granted.',
            () => setStaffEmail(''),
          )
        }}
      >
        <label>
          Existing account email
          <input
            type="email"
            required
            value={staffEmail}
            onChange={(event) => setStaffEmail(event.target.value)}
            placeholder="staff@example.com"
          />
        </label>
        <button className="button primary" disabled={busy}>
          Add staff member
        </button>
      </form>
      <p className="review-hint">
        They must create and confirm their account first. Ask them to refresh after you add them.
      </p>
      <ul className="member-list">
        {members.map((item) => (
          <li key={item.user_id}>
            <span>
              {item.user_id === userId ? 'You' : item.email || `Account ${item.user_id}`}{' '}
              <small>· {item.role}</small>
            </span>
            {item.role === 'staff' && (
              <button
                disabled={busy}
                className="text-action"
                onClick={() =>
                  mutate(
                    () =>
                      supabase.rpc('parking_remove_staff', {
                        p_lot: lotId,
                        p_user: item.user_id,
                      }),
                    'Staff access removed. Linked drivers retain their own parking access.',
                  )
                }
              >
                Remove staff access
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
