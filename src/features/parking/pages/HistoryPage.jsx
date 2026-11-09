import SessionTable from '../components/SessionTable.jsx'
export default function HistoryPage({
  operator,
  historyPage,
  history,
  historyLoading,
  exportHistory,
  loadHistory,
  historyMore,
}) {
  return (
    <>
      <div className="parking-page-title">
        <h1>
          Parking history<span>.</span>
        </h1>
        <p>
          {operator
            ? 'Shared entry and exit records for this lot, newest entries first.'
            : 'Your entry and exit records, including the spot used for each visit.'}
        </p>
      </div>
      <section className="panel">
        <div className="panel-heading">
          <h2>Parking sessions · Page {historyPage + 1}</h2>
          <button
            className="text-action"
            disabled={!history.length || historyLoading}
            onClick={exportHistory}
          >
            Export this page as CSV
          </button>
        </div>
        {historyLoading ? (
          <p className="parking-empty" role="status">
            Loading history…
          </p>
        ) : (
          <SessionTable rows={history} />
        )}
        <div className="history-pagination">
          <button
            className="button secondary subtle"
            disabled={historyLoading || historyPage === 0}
            onClick={() => loadHistory(historyPage - 1)}
          >
            Previous
          </button>
          <button
            className="button secondary subtle"
            disabled={historyLoading || !historyMore}
            onClick={() => loadHistory(historyPage + 1)}
          >
            Next
          </button>
        </div>
      </section>
    </>
  )
}
