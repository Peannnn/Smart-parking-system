import PermitTable from '../../permits/PermitTable.jsx'
import PermitForm from '../../permits/PermitForm.jsx'
export default function PermitsPage({
  admin,
  vehicle,
  vehicles,
  setError,
  mutate,
  lotId,
  setVehicle,
  assignableSpots,
  busy,
  search,
  setSearch,
  members,
  spots,
  setDeleteVehicle,
}) {
  return (
    <>
      <div className="parking-page-title">
        <h1>
          Vehicles & permits<span>.</span>
        </h1>
        <p>Resident registrations and permit validity. Expiry dates include the full day in UTC.</p>
      </div>
      {admin && (
        <PermitForm
          vehicle={vehicle}
          vehicles={vehicles}
          setError={setError}
          mutate={mutate}
          lotId={lotId}
          setVehicle={setVehicle}
          assignableSpots={assignableSpots}
          busy={busy}
        />
      )}
      <PermitTable
        search={search}
        setSearch={setSearch}
        admin={admin}
        vehicles={vehicles}
        members={members}
        spots={spots}
        busy={busy}
        setVehicle={setVehicle}
        setError={setError}
        setDeleteVehicle={setDeleteVehicle}
      />
    </>
  )
}
