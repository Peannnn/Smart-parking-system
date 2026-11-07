import { useEffect, useRef } from 'react'

export default function DeletePermitDialog({ vehicle, busy, error, onCancel, onDelete }) {
  const dialog = useRef(null)
  useEffect(() => {
    const element = dialog.current
    element.showModal()
    return () => element.close()
  }, [])
  return <dialog ref={dialog} className="permit-delete-dialog" aria-labelledby="delete-permit-title" onCancel={event => { event.preventDefault(); if (!busy) onCancel() }}>
    <h2 id="delete-permit-title">Delete this permit?</h2>
    <p><strong>{vehicle.plate}</strong> · {vehicle.owner_name}</p>
    <p>This removes the permit and cancels its upcoming reservations. Recorded parking history is preserved.</p>
    {error && <p className="error" role="alert">{error}</p>}
    <div className="admission-actions"><button autoFocus className="button secondary subtle" disabled={busy} onClick={onCancel}>Keep permit</button><button className="button danger" disabled={busy} onClick={onDelete}>{busy ? 'Deleting…' : 'Delete permit'}</button></div>
  </dialog>
}
