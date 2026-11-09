// Validate and normalize a selected photo before recognition.
export default function createPhotoUpload({
  busy,
  setError,
  setBusy,
  setProgress,
  mounted,
  previewUrl,
  setImage,
  scan,
}) {
  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    setError('')
    if (
      !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
      file.size > 15 * 1024 * 1024
    ) {
      setError('Choose a JPG, PNG, or WebP image smaller than 15 MB.')
      return
    }
    setBusy(true)
    setProgress('Opening photo…')
    let bitmap
    try {
      bitmap = await createImageBitmap(file)
      if (bitmap.width * bitmap.height > 24_000_000)
        throw new Error('Photo exceeds 24 megapixels. Resize it before uploading.')
      const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      const context = canvas.getContext('2d')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      // Normalize orientation and remove metadata. Preview and inference use identical pixels.
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.95))
      if (!blob) throw new Error('Could not prepare this photo. Try another image.')
      if (!mounted.current) return
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      const src = URL.createObjectURL(blob)
      previewUrl.current = src
      const photo = {
        src,
        blob,
        name: file.name,
      }
      setImage(photo)
      await scan(photo)
    } catch (error) {
      if (mounted.current)
        setError(error.message || 'Could not open this photo. Try another image.')
    } finally {
      bitmap?.close()
      if (mounted.current) setBusy(false)
    }
  }
  return {
    upload,
  }
}
