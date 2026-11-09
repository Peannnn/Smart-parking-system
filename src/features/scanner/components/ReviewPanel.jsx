export default function ReviewPanel({
  permitCheck,
  chosen,
  result,
  selected,
  choosePlate,
  save,
  plate,
  busy,
  requirePhoto,
  setPlate,
  setNotice,
  onRecord,
  notice,
  error,
}) {
  return (
    <section className="panel review-panel" aria-labelledby="review-title">
      <div className="panel-heading">
        <h2 id="review-title">
          <span className="step-number">02</span> {permitCheck ? 'Review & check' : 'Review & save'}
        </h2>
      </div>
      <div className="review-body">
        <div className="review-status">
          <span className={chosen ? 'status-dot ready' : 'status-dot'} />
          {chosen
            ? 'Plate detected automatically'
            : result
              ? 'No plates detected'
              : 'Ready when you are'}
        </div>
        <p className="review-description">
          {permitCheck
            ? 'Review the detected plate, then check its current permit. Select a plate below if several were detected.'
            : 'Review the detected plate before saving. If a photo contains multiple plates, select one below.'}
        </p>
        {result?.plates.length > 0 && (
          <div className="plate-choices" aria-label="Detected plates">
            {result.plates.map((item, index) => (
              <button
                key={index}
                type="button"
                aria-pressed={selected === index}
                onClick={() => choosePlate(index)}
              >
                <span>Plate {index + 1}</span>
                <strong>{item.text || 'Unreadable'}</strong>
              </button>
            ))}
          </div>
        )}
        <form onSubmit={save}>
          <label className="field-label" htmlFor="plate">
            LICENSE PLATE
          </label>
          <input
            id="plate"
            className="plate-input"
            placeholder="ABC 1234"
            value={plate}
            maxLength={15}
            disabled={busy || (requirePhoto && !result?.plates.length)}
            autoComplete="off"
            spellCheck="false"
            onChange={(event) => {
              setPlate(event.target.value.toUpperCase())
              setNotice('')
            }}
          />
          {chosen && (
            <>
              <div className="recognition-details">
                <span>Plate detection confidence</span>
                <strong>{Math.round(chosen.detectionConfidence * 100)}%</strong>
              </div>
              <div className="recognition-details">
                <span>Character recognition confidence</span>
                <strong>{Math.round(chosen.recognitionConfidence * 100)}%</strong>
              </div>
            </>
          )}
          <p className="review-hint">
            {requirePhoto
              ? 'Scan your vehicle first, then review the detected plate. You can correct recognition errors before confirming.'
              : 'Check similar characters such as O / 0 and I / 1. Model confidence does not verify a plate. Manual entry is always available.'}
          </p>
          <button
            className="button primary save-button"
            disabled={busy || !plate.trim() || (requirePhoto && !result?.plates.length)}
          >
            {permitCheck
              ? 'Check permit'
              : onRecord
                ? 'Review parking action ↑'
                : '✓ Save vehicle record'}
          </button>
        </form>
        <div aria-live="polite">{notice && <p className="notice">{notice}</p>}</div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="storage-note">
          <strong>
            {permitCheck
              ? 'Permit lookup only'
              : onRecord
                ? 'Confirm before recording'
                : 'Stored in this browser'}
          </strong>
          <p>
            {permitCheck
              ? 'Checking a permit does not record entry or exit or change spot availability. Photos are not saved.'
              : onRecord
                ? 'Reviewing a plate does not check the vehicle in or out. Confirm the action above to save it to your parking lot. Photos are not saved.'
                : 'Your last 100 confirmed records stay on this device. Photos are not saved. Cloud sync is not enabled.'}
          </p>
        </div>
      </div>
    </section>
  )
}
