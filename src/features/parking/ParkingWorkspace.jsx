import WorkspaceHeader from './components/WorkspaceHeader.jsx'
import LotSelector from './components/LotSelector.jsx'
import UnlinkedAccount from './components/UnlinkedAccount.jsx'
import useParkingWorkspace from './hooks/useParkingWorkspace.js'
import DashboardPage from './pages/DashboardPage.jsx'
import EntryExitPage from './pages/EntryExitPage.jsx'
import PermitsPage from './pages/PermitsPage.jsx'
import SpotsPage from './pages/SpotsPage.jsx'
import HistoryPage from './pages/HistoryPage.jsx'
import SettingsPage from './pages/SettingsPage.jsx'
import { initialVehicle } from './parkingConstants.js'
import { supabase } from '../../services/supabase.js'
import DriverParking from '../driver/DriverParking.jsx'
import PermitChecker from '../permits/PermitChecker.jsx'
import DeletePermitDialog from '../permits/DeletePermitDialog.jsx'
import { parkingPages } from './navigation.js'
export default function ParkingWorkspace({ userId }) {
  const {
    setPage,
    role,
    admin,
    operator,
    lotId,
    busy,
    loading,
    lots,
    setReview,
    setSearch,
    setVehicle,
    setLoading,
    refresh,
    setError,
    error,
    notice,
    page,
    lot,
    open,
    spots,
    vehicles,
    search,
    setDirection,
    reviewPlate,
    direction,
    review,
    matchingSession,
    status,
    matchingVehicle,
    reviewSpot,
    mutate,
    setScannerVersion,
    scannerVersion,
    vehicle,
    assignableSpots,
    members,
    setDeleteVehicle,
    sessions,
    vacantSpots,
    historyPage,
    history,
    historyLoading,
    exportHistory,
    loadHistory,
    historyMore,
    name,
    capacity,
    setName,
    setCapacity,
    staffEmail,
    setStaffEmail,
    deleteVehicle,
  } = useParkingWorkspace(userId)
  return (
    <div className="parking-shell">
      <WorkspaceHeader setPage={setPage} role={role} admin={admin} operator={operator} />
      <main>
        <LotSelector
          lotId={lotId}
          busy={busy}
          loading={loading}
          lots={lots}
          setReview={setReview}
          setSearch={setSearch}
          setVehicle={setVehicle}
          setLoading={setLoading}
          refresh={refresh}
          setError={setError}
        />
        {error && (
          <div className="parking-alert" role="alert">
            <strong>Unable to complete this action</strong>
            <p>{error}</p>
            {/schema cache|does not exist|could not find/i.test(error) && (
              <p>
                Database setup is required. Ask your administrator to complete the parking database
                upgrade, then choose Refresh.
              </p>
            )}
          </div>
        )}
        {notice && (
          <p className="notice parking-notice" role="status">
            {notice}
          </p>
        )}
        {loading ? (
          <p className="parking-empty" role="status">
            Loading parking workspace…
          </p>
        ) : (
          <>
            <nav className="parking-nav" aria-label="Parking workspace">
              {parkingPages(role).map((tab) => (
                <button
                  key={tab}
                  aria-current={page === tab ? 'page' : undefined}
                  disabled={busy}
                  onClick={() => {
                    setPage(tab)
                    setSearch('')
                    if (tab === 'Entry / Exit') setReview(null)
                  }}
                >
                  {tab}
                </button>
              ))}
            </nav>
            {!lot ? (
              <UnlinkedAccount page={page} />
            ) : (
              <>
                {page === 'Dashboard' && operator && (
                  <DashboardPage
                    lot={lot}
                    setPage={setPage}
                    open={open}
                    spots={spots}
                    vehicles={vehicles}
                    search={search}
                    setSearch={setSearch}
                    busy={busy}
                    setDirection={setDirection}
                    reviewPlate={reviewPlate}
                  />
                )}
                {page === 'Entry / Exit' && operator && (
                  <EntryExitPage
                    busy={busy}
                    direction={direction}
                    setDirection={setDirection}
                    setReview={setReview}
                    review={review}
                    matchingSession={matchingSession}
                    status={status}
                    matchingVehicle={matchingVehicle}
                    reviewSpot={reviewSpot}
                    mutate={mutate}
                    lotId={lotId}
                    setScannerVersion={setScannerVersion}
                    scannerVersion={scannerVersion}
                    userId={userId}
                    reviewPlate={reviewPlate}
                  />
                )}
                {page === 'Vehicles & permits' && operator && (
                  <PermitsPage
                    admin={admin}
                    vehicle={vehicle}
                    vehicles={vehicles}
                    setError={setError}
                    mutate={mutate}
                    lotId={lotId}
                    setVehicle={setVehicle}
                    assignableSpots={assignableSpots}
                    busy={busy}
                    search={search}
                    setSearch={setSearch}
                    members={members}
                    spots={spots}
                    setDeleteVehicle={setDeleteVehicle}
                  />
                )}
                {page === 'Check permit' && admin && (
                  <PermitChecker key={lotId} userId={userId} lot={lot} />
                )}
                {page === 'Check in / out' && !operator && (
                  <DriverParking
                    key={lotId}
                    userId={userId}
                    lot={lot}
                    vehicles={vehicles}
                    sessions={sessions}
                    spots={spots}
                    busy={busy}
                    mutate={mutate}
                  />
                )}
                {page === 'Parking spots' && operator && (
                  <SpotsPage
                    vacantSpots={vacantSpots}
                    lot={lot}
                    spots={spots}
                    operator={operator}
                    open={open}
                  />
                )}
                {page === 'History' && (
                  <HistoryPage
                    operator={operator}
                    historyPage={historyPage}
                    history={history}
                    historyLoading={historyLoading}
                    exportHistory={exportHistory}
                    loadHistory={loadHistory}
                    historyMore={historyMore}
                  />
                )}
                {page === 'Settings' && admin && (
                  <SettingsPage
                    lot={lot}
                    mutate={mutate}
                    lotId={lotId}
                    open={open}
                    busy={busy}
                    name={name}
                    capacity={capacity}
                    setName={setName}
                    setCapacity={setCapacity}
                    staffEmail={staffEmail}
                    setStaffEmail={setStaffEmail}
                    members={members}
                    userId={userId}
                  />
                )}
              </>
            )}
          </>
        )}
        {deleteVehicle && admin && (
          <DeletePermitDialog
            vehicle={deleteVehicle}
            busy={busy}
            error={error}
            onCancel={() => setDeleteVehicle(null)}
            onDelete={() =>
              mutate(
                () =>
                  supabase.rpc('parking_delete_permit', {
                    p_lot: lotId,
                    p_vehicle: deleteVehicle.id,
                  }),
                'Permit deleted. Its assigned spot has been released.',
                () => {
                  if (vehicle.id === deleteVehicle.id) setVehicle(initialVehicle)
                  setDeleteVehicle(null)
                },
              )
            }
          />
        )}
        <footer>
          <span>SmartPark / Parking management</span>
          <span>Confirm every plate before recording</span>
        </footer>
      </main>
    </div>
  )
}
