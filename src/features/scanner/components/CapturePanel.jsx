export default function CapturePanel({
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
}) {
  return (
    <section className="panel capture-panel" aria-labelledby="capture-title">
      <div className="panel-heading">
        <h2 id="capture-title">
          <span className="step-number">01</span> Capture vehicle
        </h2>
        <span className="small-label">CAMERA · JPG · PNG · WEBP</span>
      </div>
      <div className="capture-body">
        {camera ? (
          <div className="camera-preview">
            <video ref={video} autoPlay muted playsInline aria-label="Live camera preview" />
            <span className="live-label">
              <i /> CAMERA LIVE
            </span>
            <div className="camera-guide" aria-hidden="true">
              <span>Position the vehicle plate inside the frame</span>
            </div>
          </div>
        ) : image ? (
          <div className="image-area automatic-preview" aria-busy={busy}>
            <img
              src={image.src}
              alt="Uploaded vehicle with detected license plates highlighted"
              draggable="false"
            />
            {result?.plates.map((item, index) => (
              <button
                key={index}
                type="button"
                className={`detection-box ${selected === index ? 'selected' : ''}`}
                style={{
                  left: `${item.box.x * 100}%`,
                  top: `${item.box.y * 100}%`,
                  width: `${item.box.w * 100}%`,
                  height: `${item.box.h * 100}%`,
                }}
                aria-label={`Select plate ${index + 1}: ${item.text || 'unreadable'}`}
                aria-pressed={selected === index}
                onClick={() => choosePlate(index)}
              >
                <span>
                  {index + 1} · {item.text || 'Unreadable'}
                </span>
              </button>
            ))}
            {busy && <div className="scanning-overlay">Finding plates…</div>}
          </div>
        ) : (
          <div className="empty-capture">
            <div className="plate-illustration">
              <span />
              <strong>ABC 1234</strong>
              <span />
            </div>
            <h3>The whole vehicle. Just one photo.</h3>
            <p>
              Upload a photo or use your camera.
              <br />
              We automatically locate plates and read their characters.
            </p>
            <span className="image-limit">Up to 15 MB · 24 megapixels</span>
          </div>
        )}
        {image && !camera && (
          <div className="image-caption">
            <span>{image.name}</span>
            <span>
              {result
                ? `${result.plates.length} plate(s) detected · ${(result.elapsedMs / 1000).toFixed(1)}s`
                : 'Automatic detection'}
            </span>
          </div>
        )}
        <div className="capture-actions">
          {camera ? (
            <>
              <button
                className="button secondary camera-capture-button"
                disabled={busy}
                onClick={capturePhoto}
              >
                ● Capture & recognize
              </button>
              <button className="button secondary subtle" disabled={busy} onClick={stopCamera}>
                Cancel camera
              </button>
            </>
          ) : (
            <>
              <label className={`button secondary ${busy || openingCamera ? 'disabled' : ''}`}>
                ↑ {image ? 'Choose another photo' : 'Upload & recognize'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={busy || openingCamera}
                  onChange={upload}
                />
              </label>
              <button
                className="button secondary subtle"
                disabled={busy || openingCamera}
                onClick={startCamera}
              >
                {openingCamera ? 'Opening camera…' : '◉ Use camera'}
              </button>
              {image && (
                <button
                  className="button secondary subtle"
                  disabled={busy}
                  onClick={() => scan(image)}
                >
                  Retry recognition
                </button>
              )}
            </>
          )}
        </div>
        <div className="engine-status" role="status">
          {busy ? progress : service}
        </div>
        <p className="privacy-note">
          Photos and camera captures stay on this computer. Detection and recognition run in your
          local engine.
        </p>
      </div>
    </section>
  )
}
