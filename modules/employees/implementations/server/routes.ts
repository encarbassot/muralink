import { Router } from 'express'
import type { Database } from 'better-sqlite3'
import { randomUUID } from 'crypto'
import {
  getEmployees, getEmployee, createEmployee, updateEmployee, deleteEmployee,
  getShifts, getShift, getShiftsByDate, getShiftsByEmployee,
  createShift, updateShift, deleteShift,
} from './queries.ts'
import type { YEmployee, YShift } from '../../types.ts'

export function createEmployeesRouter(db: Database): Router {
  const router = Router()

  // Employees
  router.get('/employees', (req, res) => {
    const activeOnly = req.query['active'] === 'true'
    res.json(getEmployees(db, activeOnly))
  })

  router.get('/employees/:id', (req, res) => {
    const e = getEmployee(db, req.params['id']!)
    if (!e) { res.status(404).json({ error: 'not found' }); return }
    res.json(e)
  })

  router.post('/employees', (req, res) => {
    const body = req.body as Omit<YEmployee, 'id' | 'createdAt'>
    const now = new Date().toISOString()
    const employee = createEmployee(db, {
      id: randomUUID(),
      ...body,
      active: body.active ?? true,
      createdAt: { iso: now, timezone: 'UTC' },
    })
    res.status(201).json(employee)
  })

  router.patch('/employees/:id', (req, res) => {
    const updated = updateEmployee(db, req.params['id']!, req.body as Partial<Omit<YEmployee, 'id' | 'createdAt'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/employees/:id', (req, res) => {
    if (!deleteEmployee(db, req.params['id']!)) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  // Shifts
  router.get('/shifts', (req, res) => {
    const date = req.query['date'] ? String(req.query['date']) : undefined
    res.json(date ? getShiftsByDate(db, date) : getShifts(db))
  })

  router.get('/shifts/:id', (req, res) => {
    const s = getShift(db, req.params['id']!)
    if (!s) { res.status(404).json({ error: 'not found' }); return }
    res.json(s)
  })

  router.get('/employees/:id/shifts', (req, res) => {
    const from = req.query['from'] ? String(req.query['from']) : undefined
    const to = req.query['to'] ? String(req.query['to']) : undefined
    res.json(getShiftsByEmployee(db, req.params['id']!, from, to))
  })

  router.post('/shifts', (req, res) => {
    const body = req.body as Omit<YShift, 'id'>
    const shift = createShift(db, { id: randomUUID(), ...body })
    res.status(201).json(shift)
  })

  router.patch('/shifts/:id', (req, res) => {
    const updated = updateShift(db, req.params['id']!, req.body as Partial<Omit<YShift, 'id' | 'employeeId'>>)
    if (!updated) { res.status(404).json({ error: 'not found' }); return }
    res.json(updated)
  })

  router.delete('/shifts/:id', (req, res) => {
    if (!deleteShift(db, req.params['id']!)) { res.status(404).json({ error: 'not found' }); return }
    res.status(204).end()
  })

  return router
}
