export default function UnlinkedAccount({ page }) {
  return (
    <section className="panel onboarding" aria-labelledby="new-user-title">
      <p className="eyebrow">YOUR PARKING ACCOUNT</p>
      <h1 id="new-user-title">
        {page}
        <span>.</span>
      </h1>
      <p>
        {page === 'History'
          ? 'Your recorded entries and exits will appear here after your first visit.'
          : 'Welcome! Scan to check in and out once your administrator has linked your vehicle and assigned a parking spot.'}
      </p>
      <div className="driver-access-note">
        <strong>Connect your vehicle</strong>
        <p>
          Ask your parking administrator to link your confirmed account email to your vehicle permit
          and assign your spot. Then choose Refresh to see your parking lot and start parking.
        </p>
      </div>
    </section>
  )
}
