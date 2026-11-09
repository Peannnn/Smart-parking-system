// Camera permission, capture, and stream cleanup.
export default function createCameraActions({
  cameraRequest,
  stream,
  setCamera,
  setOpeningCamera,
  busy,
  openingCamera,
  setError,
  setNotice,
  mounted,
  video,
  setBusy,
  setProgress,
  previewUrl,
  setImage,
  scan,
}) {
  function stopCamera() {
    cameraRequest.current += 1
    stream.current?.getTracks().forEach((track) => track.stop())
    stream.current = null
    setCamera(false)
    setOpeningCamera(false)
  }
  async function startCamera() {
    if (busy || openingCamera) return
    setError('')
    setNotice('')
    if (!navigator.mediaDevices?.getUserMedia) {
      setError(
        'Camera access requires a supported browser on localhost or HTTPS. You can still upload a photo.',
      )
      return
    }
    const request = ++cameraRequest.current
    setOpeningCamera(true)
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: {
            ideal: 'environment',
          },
          width: {
            ideal: 1920,
          },
          height: {
            ideal: 1080,
          },
        },
        audio: false,
      })
      if (!mounted.current || request !== cameraRequest.current) {
        media.getTracks().forEach((track) => track.stop())
        return
      }
      stream.current = media
      setCamera(true)
    } catch (error) {
      if (mounted.current && request === cameraRequest.current) {
        setError(
          error.name === 'NotAllowedError'
            ? 'Camera access was not allowed. Enable camera permission for this site or upload a photo.'
            : 'Could not open the camera. Check that another app is not using it, or upload a photo.',
        )
      }
    } finally {
      if (mounted.current && request === cameraRequest.current) setOpeningCamera(false)
    }
  }
  async function capturePhoto() {
    const source = video.current
    if (!source?.videoWidth || busy) {
      setError('Wait for the camera preview to appear, then try again.')
      return
    }
    setBusy(true)
    setProgress('Preparing camera photo…')
    try {
      const scale = Math.min(1, 3000 / Math.max(source.videoWidth, source.videoHeight))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(source.videoWidth * scale)
      canvas.height = Math.round(source.videoHeight * scale)
      canvas.getContext('2d').drawImage(source, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95))
      if (!blob) throw new Error('Could not capture the photo. Please try again.')
      stopCamera()
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      const src = URL.createObjectURL(blob)
      previewUrl.current = src
      const photo = {
        src,
        blob,
        name: `Camera capture ${new Date().toLocaleTimeString()}`,
      }
      setImage(photo)
      await scan(photo)
    } catch (error) {
      if (mounted.current)
        setError(error.message || 'Could not capture the photo. Please try again.')
    } finally {
      if (mounted.current) setBusy(false)
    }
  }
  return {
    stopCamera,
    startCamera,
    capturePhoto,
  }
}
