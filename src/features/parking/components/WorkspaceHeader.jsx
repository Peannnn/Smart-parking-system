import { homePage } from '../navigation.js'
export default function WorkspaceHeader({ setPage, role, admin, operator }) {
  return (
    <header className="topbar">
      <a
        className="brand"
        href="#"
        onClick={(event) => {
          event.preventDefault()
          setPage(homePage(role))
        }}
      >
        <span className="brand-icon">P</span>Smart<span className="brand-light">Park</span>
      </a>
      <span className="workspace-label">PARKING MANAGEMENT</span>
      <span className="device-badge">
        {admin ? 'Administrator' : operator ? 'Staff' : 'Driver'}
      </span>
    </header>
  )
}
