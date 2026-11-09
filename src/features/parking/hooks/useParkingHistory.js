import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../services/supabase.js'
import { csvCell } from '../../../shared/parkingFormatters.js'
// Loads one page at a time and ignores responses for a previous lot or page.
export default function useParkingHistory(lotId, page, setError) {
  const [history, setHistory] = useState([])
  const [historyPage, setHistoryPage] = useState(0)
  const [historyMore, setHistoryMore] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const historySequence = useRef(0)
  const loadHistory = useCallback(
    async (offset = 0) => {
      if (!lotId) return
      const request = ++historySequence.current
      setHistoryLoading(true)
      try {
        const { data, error } = await supabase
          .from('parking_sessions')
          .select('*')
          .eq('lot_id', lotId)
          .order('entry_at', {
            ascending: false,
          })
          .order('id')
          .range(offset * 50, offset * 50 + 50)
        if (error) throw error
        if (request !== historySequence.current) return
        setHistory(data.slice(0, 50))
        setHistoryPage(offset)
        setHistoryMore(data.length > 50)
      } catch (error) {
        if (request === historySequence.current) setError(error.message)
      } finally {
        if (request === historySequence.current) setHistoryLoading(false)
      }
    },
    [lotId, setError],
  )
  useEffect(() => {
    const timer = setTimeout(() => {
      if (page === 'History') loadHistory()
    }, 0)
    return () => {
      clearTimeout(timer)
      historySequence.current += 1
    }
  }, [page, loadHistory])
  function exportHistory() {
    const rows = [
      ['Plate', 'Spot ID', 'Entry', 'Exit', 'Admission', 'Visitor reason'],
      ...history.map((item) => [
        item.plate,
        item.spot_label,
        item.entry_at,
        item.exit_at,
        item.admission,
        item.visitor_reason,
      ]),
    ]
    const url = URL.createObjectURL(
      new Blob(['\uFEFF' + rows.map((row) => row.map(csvCell).join(',')).join('\r\n')], {
        type: 'text/csv;charset=utf-8',
      }),
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'parking-history-page.csv'
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  return {
    history,
    historyPage,
    historyMore,
    historyLoading,
    loadHistory,
    exportHistory,
    setHistory,
  }
}
