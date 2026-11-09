import createSaveAction from '../actions/createSaveAction.js'
import createRecognitionAction from '../actions/createRecognitionAction.js'
import createCameraActions from '../actions/createCameraActions.js'
import createPhotoUpload from '../actions/createPhotoUpload.js'
import { useEffect, useRef, useState } from 'react'
import { supabase } from '../../../services/supabase.js'
import { loadHistory } from '../services/localHistory.js'
export default function usePlateScanner({
  userId,
  onRecord,
  permitCheck = false,
  requirePhoto = false,
}) {
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [plate, setPlate] = useState('')
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState(0)
  const [history, setHistory] = useState(() => loadHistory(userId))
  const [service, setService] = useState('Checking local engine…')
  const [camera, setCamera] = useState(false)
  const [openingCamera, setOpeningCamera] = useState(false)
  const [todos, setTodos] = useState([])
  const [todoStatus, setTodoStatus] = useState(
    supabase ? 'Loading…' : 'Supabase is not configured.',
  )
  const activeRequest = useRef(null)
  const mounted = useRef(false)
  const previewUrl = useRef(null)
  const video = useRef(null)
  const stream = useRef(null)
  const cameraRequest = useRef(0)
  const chosen = result?.plates[selected]
  useEffect(() => {
    const pendingRequest = activeRequest
    const cameraStream = stream
    const currentPreview = previewUrl
    mounted.current = true
    const health = new AbortController()
    fetch('/api/health', {
      signal: health.signal,
    })
      .then((response) => response.json())
      .then((data) => {
        if (mounted.current)
          setService(data.ready ? 'Local ALPR ready' : 'Local engine needs setup')
      })
      .catch(() => {
        if (mounted.current) setService('Start local engine: npm run api')
      })
    return () => {
      mounted.current = false
      health.abort()
      pendingRequest.current?.abort()
      cameraRequest.current += 1
      cameraStream.current?.getTracks().forEach((track) => track.stop())
      if (currentPreview.current) URL.revokeObjectURL(currentPreview.current)
    }
  }, [])
  useEffect(() => {
    if (camera && video.current) video.current.srcObject = stream.current
  }, [camera])
  useEffect(() => {
    if (!supabase || onRecord) return
    let active = true
    supabase
      .from('todos')
      .select('id,name')
      .then(({ data, error }) => {
        if (!active) return
        setTodos(data || [])
        setTodoStatus(
          error
            ? 'Could not load existing todos. Check Supabase configuration and read permissions.'
            : '',
        )
      })
      .catch(() => {
        if (active) setTodoStatus('Could not reach Supabase.')
      })
    return () => {
      active = false
    }
  }, [onRecord])
  function scan(...args) {
    return createRecognitionAction({
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
    }).scan(...args)
  }
  function upload(...args) {
    return createPhotoUpload({
      busy,
      setError,
      setBusy,
      setProgress,
      mounted,
      previewUrl,
      setImage,
      scan,
    }).upload(...args)
  }
  function stopCamera(...args) {
    return createCameraActions({
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
    }).stopCamera(...args)
  }
  function startCamera(...args) {
    return createCameraActions({
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
    }).startCamera(...args)
  }
  function capturePhoto(...args) {
    return createCameraActions({
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
    }).capturePhoto(...args)
  }
  function save(...args) {
    return createSaveAction({
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
    }).save(...args)
  }
  function choosePlate(index) {
    setSelected(index)
    setPlate(result.plates[index].text)
    setNotice('')
    setError('')
  }
  return {
    camera,
    video,
    image,
    busy,
    result,
    selected,
    choosePlate,
    capturePhoto,
    stopCamera,
    openingCamera,
    upload,
    startCamera,
    scan,
    progress,
    service,
    permitCheck,
    chosen,
    save,
    plate,
    requirePhoto,
    setPlate,
    setNotice,
    onRecord,
    notice,
    error,
    history,
    todoStatus,
    todos,
  }
}
