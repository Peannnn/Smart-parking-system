import CapturePanel from './components/CapturePanel.jsx'
import ReviewPanel from './components/ReviewPanel.jsx'
import LocalScanHistory from './components/LocalScanHistory.jsx'
import LegacyTodos from './components/LegacyTodos.jsx'
import usePlateScanner from './hooks/usePlateScanner.js'
export default function PlateScanner({
  userId,
  onRecord,
  permitCheck = false,
  requirePhoto = false,
}) {
  const {
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
    chosen,
    save,
    plate,
    setPlate,
    setNotice,
    notice,
    error,
    history,
    todoStatus,
    todos,
  } = usePlateScanner({
    userId,
    onRecord,
    permitCheck,
    requirePhoto,
  })
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brand-icon">P</span>Smart<span className="brand-light">Park</span>
        </a>
        <span className="workspace-label">SMART PARKING SYSTEM</span>
        <span className="device-badge">
          <i /> Local processing
        </span>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">SMART PARKING</p>
            <h1>
              Automatic plate recognition<span>.</span>
            </h1>
            <p>
              Upload a vehicle photo or capture one with your camera. We’ll find and read the plates
              for you.
            </p>
          </div>
          <span className="step-pill">ON-DEVICE ALPR</span>
        </div>
        <div className="scanner-grid">
          <CapturePanel
            camera={camera}
            video={video}
            image={image}
            busy={busy}
            result={result}
            selected={selected}
            choosePlate={choosePlate}
            capturePhoto={capturePhoto}
            stopCamera={stopCamera}
            openingCamera={openingCamera}
            upload={upload}
            startCamera={startCamera}
            scan={scan}
            progress={progress}
            service={service}
          />
          <ReviewPanel
            permitCheck={permitCheck}
            chosen={chosen}
            result={result}
            selected={selected}
            choosePlate={choosePlate}
            save={save}
            plate={plate}
            busy={busy}
            requirePhoto={requirePhoto}
            setPlate={setPlate}
            setNotice={setNotice}
            onRecord={onRecord}
            notice={notice}
            error={error}
          />
        </div>
        {!onRecord && <LocalScanHistory history={history} />}
        {!onRecord && <LegacyTodos todoStatus={todoStatus} todos={todos} />}
        <footer>
          <span>SmartPark / Smart parking system</span>
          <span>Review every plate before use</span>
        </footer>
      </main>
    </div>
  )
}
