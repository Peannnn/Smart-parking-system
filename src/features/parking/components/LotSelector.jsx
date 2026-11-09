import { initialVehicle } from '../parkingConstants.js'
export default function LotSelector({
  lotId,
  busy,
  loading,
  lots,
  setReview,
  setSearch,
  setVehicle,
  setLoading,
  refresh,
  setError,
}) {
  return (
    <div className="parking-toolbar">
      <label>
        Parking lot{' '}
        <select
          aria-label="Parking lot"
          value={lotId}
          disabled={busy || loading || !lots.length}
          onChange={(event) => {
            const id = event.target.value
            setReview(null)
            setSearch('')
            setVehicle(initialVehicle)
            setLoading(true)
            refresh(id)
              .catch((error) => setError(error.message))
              .finally(() => setLoading(false))
          }}
        >
          {!lots.length && <option value="">No parking lot linked yet</option>}
          {lots.map((item) => (
            <option value={item.id} key={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <button
        className="button secondary subtle"
        disabled={busy || loading}
        onClick={() => {
          setLoading(true)
          setError('')
          refresh(lotId)
            .catch((error) => setError(error.message))
            .finally(() => setLoading(false))
        }}
      >
        Refresh
      </button>
    </div>
  )
}
