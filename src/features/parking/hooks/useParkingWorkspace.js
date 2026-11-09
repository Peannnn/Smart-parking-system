import useParkingHistory from './useParkingHistory.js'
import { initialVehicle } from '../parkingConstants.js'
import { allRows, allSpots } from '../services/parkingRepository.js'
import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../../services/supabase.js'
import { homePage, parkingPages } from '../navigation.js'
import { normalizePlate, permitStatus, validPlate } from '../../../shared/parkingFormatters.js'

export default function useParkingWorkspace(userId) {
  const [lots, setLots] = useState([])
  const [lotId, setLotId] = useState('')
  const [members, setMembers] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [sessions, setSessions] = useState([])
  const [spots, setSpots] = useState([])
  const [scannerVersion, setScannerVersion] = useState(0)
  const [page, setPage] = useState('Check in / out')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  // Keep drafts here so switching pages does not discard unfinished edits.
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState(50)
  const [vehicle, setVehicle] = useState(initialVehicle)
  const [deleteVehicle, setDeleteVehicle] = useState(null)
  const [staffEmail, setStaffEmail] = useState('')
  const [search, setSearch] = useState('')
  const [direction, setDirection] = useState('entry')
  const [review, setReview] = useState(null)
  const {
    history,
    historyPage,
    historyMore,
    historyLoading,
    loadHistory,
    exportHistory,
    setHistory,
  } = useParkingHistory(lotId, page, setError)
  const activeLot = useRef('')
  const sequence = useRef(0)
  const mutationLock = useRef(false)
  const lot = lots.find((item) => item.id === lotId)
  const role = members.find((item) => item.user_id === userId)?.role
  const operator = role === 'admin' || role === 'staff'
  const admin = members.some((item) => item.user_id === userId && item.role === 'admin')
  const open = sessions.filter((item) => !item.exit_at)
  const matchingVehicle = vehicles.find((item) => item.plate === review)
  const status = permitStatus(matchingVehicle)
  const matchingSession = open.find((item) => item.plate === review)
  const vacantSpots = spots.filter((item) => item.active && !item.occupied)
  const reviewSpot = spots.find((item) => item.id === matchingVehicle?.assigned_spot_id)
  const assignableSpots = spots.filter(
    (item) =>
      item.active &&
      (!item.assigned_vehicle_id || item.assigned_vehicle_id === vehicle.id) &&
      (!item.occupied ||
        (vehicle.id &&
          sessions.some(
            (session) =>
              !session.exit_at &&
              session.spot_id === item.id &&
              session.plate === vehicles.find((current) => current.id === vehicle.id)?.plate,
          ))),
  )
  const refresh = useCallback(
    async (preferred) => {
      // Ignore responses that arrive after a newer lot refresh.
      const request = ++sequence.current
      const { data: nextLots, error } = await supabase
        .from('parking_lots')
        .select('*')
        .order('created_at')
      if (error) throw error
      const selected = nextLots.find((item) => item.id === preferred)?.id || nextLots[0]?.id || ''
      let results = []
      let nextRole = ''
      if (selected) {
        const access = await supabase
          .from('parking_members')
          .select('*')
          .eq('lot_id', selected)
          .eq('user_id', userId)
          .single()
        if (access.error) throw access.error
        nextRole = access.data.role
        results = await Promise.all([
          nextRole === 'driver'
            ? Promise.resolve({
                data: [access.data],
                error: null,
              })
            : supabase.rpc('parking_list_members', {
                p_lot: selected,
              }),
          allRows('parking_vehicles', selected),
          allRows('parking_sessions', selected, true),
          allSpots(selected),
        ])
        const problem = results.find((result) => result.error)?.error
        if (problem) throw problem
      }
      if (request !== sequence.current) return
      if (activeLot.current !== selected) {
        activeLot.current = selected
        setReview(null)
        setVehicle(initialVehicle)
        setSearch('')
        setPage(homePage(nextRole))
        setHistory([])
        setDeleteVehicle(null)
      }
      setPage((current) =>
        parkingPages(nextRole).includes(current) ? current : homePage(nextRole),
      )
      setLots(nextLots)
      setLotId(selected)
      setMembers(results[0]?.data || [])
      setVehicles((results[1]?.data || []).sort((a, b) => a.plate.localeCompare(b.plate)))
      setSessions(results[2]?.data || [])
      setSpots(results[3]?.data || [])
    },
    [userId, setHistory],
  )
  useEffect(() => {
    let active = true
    const timer = setTimeout(
      () =>
        refresh()
          .catch((error) => {
            if (active) setError(error.message)
          })
          .finally(() => {
            if (active) setLoading(false)
          }),
      0,
    )
    return () => {
      active = false
      clearTimeout(timer)
      sequence.current += 1
    }
  }, [refresh])

  // Poll to pick up other staff actions. Mutations always recheck live database state.
  useEffect(() => {
    if (!lotId) return
    const interval = setInterval(() => {
      if (!mutationLock.current) refresh(lotId).catch((error) => setError(error.message))
    }, 15000)
    return () => clearInterval(interval)
  }, [lotId, refresh])
  // Serialize writes, then refresh the shared workspace after a successful save.
  async function mutate(action, message, after) {
    if (mutationLock.current) return
    mutationLock.current = true
    setBusy(true)
    setError('')
    setNotice('')
    let saved = false
    try {
      const { data, error } = await action()
      if (error) throw error
      saved = true
      after?.()
      setNotice(message)
      await refresh(typeof data === 'string' && !lotId ? data : lotId)
    } catch (error) {
      setError(
        saved
          ? `Saved successfully, but the dashboard could not refresh: ${error.message}. Use Refresh to reload it.`
          : error.message,
      )
    } finally {
      mutationLock.current = false
      setBusy(false)
    }
  }
  function reviewPlate(plate) {
    if (mutationLock.current) throw new Error('Wait for the current action to finish.')
    const normalized = normalizePlate(plate)
    if (!validPlate(normalized)) throw new Error('Enter a valid plate (2–15 characters).')
    setReview(normalized)
    setError('')
    setNotice('')
  }
  return {
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
  }
}
