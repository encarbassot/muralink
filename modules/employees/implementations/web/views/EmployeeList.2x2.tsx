import type { YEmployee, EmployeeRole } from '../../../types.ts'

interface Props {
  employees?: YEmployee[]
  onEmployeeClick?: (employee: YEmployee) => void
}

const ROLE_LABELS: Record<EmployeeRole, string> = {
  stylist: 'Estilista',
  colorist: 'Colorista',
  'nail-tech': 'Manicura',
  receptionist: 'Recepcionista',
  manager: 'Manager',
}

export function EmployeeList({ employees = [], onEmployeeClick }: Props) {
  const active = employees.filter(e => e.active)
  const inactive = employees.filter(e => !e.active)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', fontFamily: 'inherit' }}>
      <div style={{ padding: '8px 12px', fontWeight: 600, fontSize: 13, borderBottom: '1px solid var(--border, #d4cfc9)' }}>
        Empleados · {active.length} activos
      </div>
      <div style={{ flex: 1, overflow: 'auto' }}>
        {employees.length === 0 && (
          <div style={{ padding: 16, color: 'var(--muted-foreground, #6b6560)', fontSize: 13 }}>Sin empleados</div>
        )}
        {active.map(emp => (
          <EmployeeRow key={emp.id} employee={emp} onClick={onEmployeeClick} />
        ))}
        {inactive.length > 0 && (
          <>
            <div style={{ padding: '6px 12px', fontSize: 11, color: 'var(--muted-foreground, #6b6560)', background: 'var(--muted, #f5f3f0)' }}>
              Inactivos
            </div>
            {inactive.map(emp => (
              <EmployeeRow key={emp.id} employee={emp} onClick={onEmployeeClick} dim />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function EmployeeRow({
  employee,
  onClick,
  dim = false,
}: {
  employee: YEmployee
  onClick?: (e: YEmployee) => void
  dim?: boolean
}) {
  return (
    <div
      onClick={() => onClick?.(employee)}
      style={{
        padding: '10px 12px',
        borderBottom: '1px solid var(--border, #d4cfc9)',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        opacity: dim ? 0.5 : 1,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: '50%',
          background: employee.color ?? '#b5936a',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          fontWeight: 700,
          fontSize: 12,
          flexShrink: 0,
        }}
      >
        {employee.name[0]?.toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {employee.name}
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted-foreground, #6b6560)' }}>
          {ROLE_LABELS[employee.role]}
        </div>
      </div>
    </div>
  )
}
