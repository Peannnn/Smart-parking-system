export default function LocalScanHistory({ history }) {
  return (
    <section className="panel history-panel">
      <div className="panel-heading">
        <h2>
          Recent vehicles <span className="count">{history.length}</span>
        </h2>
        <span className="small-label">LOCAL SCAN HISTORY</span>
      </div>
      {history.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>License plate</th>
                <th>Recorded</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {history.map((record) => (
                <tr key={record.id}>
                  <td>
                    <span className="table-plate">{record.plate}</span>
                  </td>
                  <td>{new Date(record.time).toLocaleString()}</td>
                  <td>
                    <span className="source-label">{record.source}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="history-empty">
          <span className="empty-history-icon">≡</span>
          <div>
            <strong>Your vehicle log starts here</strong>
            <p>Confirmed license plates will appear here after you save them.</p>
          </div>
        </div>
      )}
    </section>
  )
}
