import { recognizePhoto } from '../services/recognitionApi.js'
// Recognize one photo and ignore cancelled or stale requests.
export default function createRecognitionAction({
  activeRequest,
  setResult,
  setSelected,
  setPlate,
  setError,
  setNotice,
  setBusy,
  setProgress,
  mounted,
  setService,
}) {
  async function scan(photo) {
    const controller = new AbortController()
    activeRequest.current?.abort()
    activeRequest.current = controller
    setResult(null)
    setSelected(0)
    setPlate('')
    setError('')
    setNotice('')
    setBusy(true)
    setProgress('Finding and reading plates on your device…')
    try {
      const data = await recognizePhoto(photo.blob, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      setResult(data)
      setPlate(data.plates[0]?.text || '')
      setService('Local ALPR ready')
      if (!data.plates.length) {
        setNotice(
          'No license plate detected. Try a closer, clearer vehicle photo, or enter the plate manually.',
        )
      } else if (!data.plates[0].text) {
        setNotice(
          'A plate was located but could not be read. Enter its characters manually or try a clearer photo.',
        )
      }
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setError(error.message)
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null
        if (mounted.current) setBusy(false)
      }
    }
  }
  return {
    scan,
  }
}
