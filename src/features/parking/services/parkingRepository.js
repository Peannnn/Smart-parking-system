import { supabase } from '../../../services/supabase.js'
export async function allRows(table, lotId, openOnly = false) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    let query = supabase
      .from(table)
      .select('*')
      .eq('lot_id', lotId)
      .order('id')
      .range(offset, offset + 499)
    if (openOnly) query = query.is('exit_at', null)
    const { data, error } = await query
    if (error)
      return {
        data: null,
        error,
      }
    rows.push(...data)
    if (data.length < 500)
      return {
        data: rows,
        error: null,
      }
  }
}
export async function allSpots(lotId) {
  const rows = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase
      .rpc('parking_spot_overview', {
        p_lot: lotId,
      })
      .order('number')
      .range(offset, offset + 499)
    if (error)
      return {
        data: null,
        error,
      }
    rows.push(...data)
    if (data.length < 500)
      return {
        data: rows,
        error: null,
      }
  }
}
