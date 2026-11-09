import StaffAccessPanel from '../../settings/StaffAccessPanel.jsx'
import CreateLotForm from '../../settings/CreateLotForm.jsx'
import LotSettingsForm from '../../settings/LotSettingsForm.jsx'
export default function SettingsPage({
  lot,
  mutate,
  lotId,
  open,
  busy,
  name,
  capacity,
  setName,
  setCapacity,
  staffEmail,
  setStaffEmail,
  members,
  userId,
}) {
  return (
    <>
      <div className="parking-page-title">
        <h1>
          Lot settings<span>.</span>
        </h1>
        <p>Manage capacity and staff access.</p>
      </div>
      <LotSettingsForm lot={lot} mutate={mutate} lotId={lotId} open={open} busy={busy} />
      <CreateLotForm
        mutate={mutate}
        name={name}
        capacity={capacity}
        setName={setName}
        setCapacity={setCapacity}
        busy={busy}
      />
      <StaffAccessPanel
        mutate={mutate}
        lotId={lotId}
        staffEmail={staffEmail}
        setStaffEmail={setStaffEmail}
        busy={busy}
        members={members}
        userId={userId}
      />
    </>
  )
}
