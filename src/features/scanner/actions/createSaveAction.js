import { saveHistory } from '../services/localHistory.js'
// Review a plate through the parking callback or optional local history.
export default function createSaveAction({
  requirePhoto,
  result,
  setError,
  plate,
  onRecord,
  busy,
  setBusy,
  setNotice,
  setProgress,
  permitCheck,
  mounted,
  chosen,
  history,
  userId,
  setHistory,
  setPlate,
}) {
  async function save(event) {
    event.preventDefault()
    if (requirePhoto && !result?.plates.length) {
      setError('Scan a vehicle photo before reviewing your plate.')
      return
    }
    const normalized = plate.trim().toUpperCase().replace(/\s+/g, ' ')
    if (!/^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$/.test(normalized)) {
      setError('Enter 2–15 characters using letters, numbers, spaces, or hyphens.')
      return
    }
    if (onRecord) {
      if (busy) return
      setBusy(true)
      setError('')
      setNotice('')
      setProgress(permitCheck ? 'Checking permit…' : 'Reviewing plate…')
      try {
        const message = await onRecord(normalized)
        if (!mounted.current) return
        setError('')
        setNotice(message || 'Plate ready. Confirm the parking action above.')
        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        })
      } catch (error) {
        if (mounted.current) setError(error.message)
      } finally {
        if (mounted.current) setBusy(false)
      }
      return
    }
    const next = [
      {
        id: crypto.randomUUID(),
        plate: normalized,
        time: new Date().toISOString(),
        source: chosen?.text ? 'ALPR reviewed' : 'Manual entry',
      },
      ...history,
    ].slice(0, 100)
    if (!saveHistory(next, userId)) {
      setError('Browser storage is unavailable or full. The record was not saved.')
      return
    }
    setHistory(next)
    setError('')
    setNotice(`${normalized} saved to this browser.`)
    setPlate('')
  }
  return {
    save,
  }
}
