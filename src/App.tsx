import { useEffect, useMemo, useRef, useState } from "react"

type Todo = {
  id: string
  text: string
  completed: boolean
  dueDate: string | null
  completedAt: string | null
  archivedAt: string | null
}

type Filter = "all" | "active" | "completed" | "calendar" | "archive"

type StoredTodo = {
  id: string
  text: string
  completed?: boolean
  dueDate?: string | null
  completedAt?: string | null
  archivedAt?: string | null
}

const STORAGE_KEY = "todos:v1"
const COMPLETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function parseDueDate(iso: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    const [year, month, day] = iso.split("-").map(Number)
    return new Date(year, month - 1, day)
  }
  return new Date(iso)
}

function hasExplicitTime(iso: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(iso)
}

function dateTimeInputValue(iso: string | null): string {
  if (!iso) return ""
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(iso)) return iso
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return `${iso}T00:00`
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const hours = String(d.getHours()).padStart(2, "0")
  const minutes = String(d.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function formatDueDate(iso: string): string {
  const d = parseDueDate(iso)
  const withTime = hasExplicitTime(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(d)
  due.setHours(0, 0, 0, 0)
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diff < 0) return "Overdue"
  const time = withTime
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : null
  if (diff === 0) return time ? `Due today at ${time}` : "Due today"
  if (diff === 1) return time ? `Due tomorrow at ${time}` : "Due tomorrow"
  if (diff <= 7) return time ? `Due in ${diff} days at ${time}` : `Due in ${diff} days`
  return withTime
    ? d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
}

function formatExactDueDate(iso: string): string {
  const d = parseDueDate(iso)
  return hasExplicitTime(iso)
    ? d.toLocaleString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })
    : d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      })
}

function isOverdue(iso: string): boolean {
  const due = parseDueDate(iso)
  if (!hasExplicitTime(iso)) {
    due.setHours(23, 59, 59, 999)
  }
  return Date.now() > due.getTime()
}

function nowLocalISO(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  const hours = String(d.getHours()).padStart(2, "0")
  const minutes = String(d.getMinutes()).padStart(2, "0")
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function dueDateKey(iso: string | null): string | null {
  if (!iso) return null
  const match = iso.match(/^\d{4}-\d{2}-\d{2}/)
  return match ? match[0] : null
}

function getCalendarGrid(year: number, month: number): (number | null)[][] {
  const first = new Date(year, month, 1)
  const last = new Date(year, month + 1, 0)
  const startDay = first.getDay()
  const daysInMonth = last.getDate()
  const weeks: (number | null)[][] = []
  let week: (number | null)[] = []
  for (let i = 0; i < startDay; i++) week.push(null)
  for (let d = 1; d <= daysInMonth; d++) {
    week.push(d)
    if (week.length === 7) {
      weeks.push(week)
      week = []
    }
  }
  if (week.length) {
    while (week.length < 7) week.push(null)
    weeks.push(week)
  }
  return weeks
}

function isExpiredArchived(todo: Todo, now = Date.now()): boolean {
  if (!todo.archivedAt) return false
  const archivedTime = new Date(todo.archivedAt).getTime()
  if (Number.isNaN(archivedTime)) return false
  return now - archivedTime > COMPLETED_RETENTION_MS
}

function normalizeTodo(stored: StoredTodo): Todo {
  const completed = Boolean(stored.completed)
  const completedAt = completed ? stored.completedAt ?? new Date().toISOString() : null
  return {
    id: stored.id,
    text: stored.text,
    completed,
    dueDate: stored.dueDate ?? null,
    completedAt,
    archivedAt: stored.archivedAt ?? null,
  }
}

function formatArchiveRemaining(archivedAt: string | null): string {
  if (!archivedAt) return ""
  const expiresAt = new Date(new Date(archivedAt).getTime() + COMPLETED_RETENTION_MS)
  const now = Date.now()
  const msLeft = expiresAt.getTime() - now
  if (msLeft <= 0) return "Expires today"
  const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
  return `Keeps for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}`
}

export default function App() {
  const [text, setText] = useState("")
  const [dueDate, setDueDate] = useState<string>("")
  const [filter, setFilter] = useState<Filter>("all")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const [editingDueDate, setEditingDueDate] = useState<string>("")
  const skipBlurSaveRef = useRef(false)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [todos, setTodos] = useState<Todo[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as StoredTodo[]
      if (!Array.isArray(parsed)) return []
      const normalized = parsed.map(normalizeTodo)
      return normalized.filter((todo) => !isExpiredArchived(todo))
    } catch {
      return []
    }
  })

  useEffect(() => {
    setTodos((prev) => {
      const pruned = prev.filter((todo) => !isExpiredArchived(todo))
      return pruned.length === prev.length ? prev : pruned
    })
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  }, [todos])

  const visibleTodos = useMemo(() => todos.filter((t) => !t.archivedAt), [todos])
  const archivedTodos = useMemo(
    () => todos.filter((t) => t.archivedAt).sort((a, b) => new Date(b.archivedAt ?? 0).getTime() - new Date(a.archivedAt ?? 0).getTime()),
    [todos]
  )

  const remainingCount = useMemo(
    () => visibleTodos.filter((t) => !t.completed).length,
    [visibleTodos]
  )
  const completedCount = visibleTodos.length - remainingCount
  const totalCount = visibleTodos.length
  const overdueCount = useMemo(
    () => visibleTodos.filter((t) => !t.completed && t.dueDate && isOverdue(t.dueDate)).length,
    [visibleTodos]
  )

  const dueCountByDate = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of visibleTodos) {
      if (t.completed) continue
      const key = dueDateKey(t.dueDate)
      if (key) map.set(key, (map.get(key) ?? 0) + 1)
    }
    return map
  }, [visibleTodos])

  const dueTasksByDate = useMemo(() => {
    const map = new Map<string, string[]>()
    for (const t of visibleTodos) {
      if (t.completed) continue
      const key = dueDateKey(t.dueDate)
      if (!key) continue
      const list = map.get(key) ?? []
      list.push(t.text)
      map.set(key, list)
    }
    return map
  }, [visibleTodos])

  const calendarGrid = useMemo(
    () => getCalendarGrid(calendarMonth.getFullYear(), calendarMonth.getMonth()),
    [calendarMonth]
  )

  const filteredTodos = useMemo(() => {
    if (filter === "active") return visibleTodos.filter((t) => !t.completed)
    if (filter === "completed") return visibleTodos.filter((t) => t.completed)
    if (filter === "calendar" || filter === "archive") return []
    return visibleTodos
  }, [filter, visibleTodos])

  function addTodo() {
    const trimmed = text.trim()
    if (!trimmed) return

    setTodos((prev) => [
      {
        id: makeId(),
        text: trimmed,
        completed: false,
        dueDate: dueDate || null,
        completedAt: null,
        archivedAt: null,
      },
      ...prev,
    ])
    setText("")
    setDueDate("")
  }

  function toggleTodo(id: string) {
    setTodos((prev) =>
      prev.map((t) => {
        if (t.id !== id) return t
        const nextCompleted = !t.completed
        return {
          ...t,
          completed: nextCompleted,
          completedAt: nextCompleted ? new Date().toISOString() : null,
          archivedAt: nextCompleted ? t.archivedAt : null,
        }
      })
    )
  }

  function deleteTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  function clearCompleted() {
    const now = new Date().toISOString()
    setTodos((prev) =>
      prev.map((t) =>
        t.completed && !t.archivedAt
          ? {
              ...t,
              archivedAt: now,
              completedAt: t.completedAt ?? now,
            }
          : t
      )
    )
  }

  function clearAllVisible() {
    setTodos((prev) => prev.filter((t) => t.archivedAt))
  }

  function startEditing(todo: Todo) {
    setEditingId(todo.id)
    setEditingText(todo.text)
    setEditingDueDate(dateTimeInputValue(todo.dueDate))
  }

  function cancelEditing() {
    skipBlurSaveRef.current = true
    setEditingId(null)
    setEditingText("")
    setEditingDueDate("")
  }

  function saveEditing(id: string) {
    const trimmed = editingText.trim()

    if (!trimmed) {
      setEditingId(null)
      setEditingText("")
      return
    }

    setTodos((prev) =>
      prev.map((t) =>
        t.id === id ? { ...t, text: trimmed, dueDate: editingDueDate || null } : t
      )
    )
    setEditingId(null)
    setEditingText("")
    setEditingDueDate("")
  }

  function filterButtonStyle(value: Filter) {
    const isActive = filter === value
    return {
      padding: "8px 10px",
      borderRadius: 10,
      border: isActive ? "1px solid #0f172a" : "1px solid rgba(0,0,0,0.2)",
      cursor: "pointer",
      background: isActive ? "#0f172a" : "transparent",
      color: isActive ? "#fff" : "inherit",
      fontWeight: isActive ? 600 : 500,
      boxShadow: isActive ? "0 1px 2px rgba(0,0,0,0.2)" : "none",
    } as const
  }

  return (
    <div
      style={{
        maxWidth: 520,
        margin: "40px auto",
        padding: 20,
        fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>Aidan's Tasks</h1>
      <p style={{ marginTop: 0, opacity: 0.8 }}>{remainingCount} remaining</p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          addTodo()
        }}
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task..."
          style={{
            flex: "1 1 200px",
            minWidth: 0,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
          }}
        />
        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          min={nowLocalISO()}
          style={{
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            fontFamily: "Arial, sans-serif",
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 14px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
            cursor: "pointer",
          }}
        >
          Add
        </button>
      </form>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={() => setFilter("all")} aria-pressed={filter === "all"} style={filterButtonStyle("all")}>
            All
          </button>
          <button onClick={() => setFilter("active")} aria-pressed={filter === "active"} style={filterButtonStyle("active")}>
            Active
          </button>
          <button onClick={() => setFilter("completed")} aria-pressed={filter === "completed"} style={filterButtonStyle("completed")}>
            Completed
          </button>
          <button onClick={() => setFilter("calendar")} aria-pressed={filter === "calendar"} style={filterButtonStyle("calendar")}>
            Calendar
          </button>
          <button onClick={() => setFilter("archive")} aria-pressed={filter === "archive"} style={filterButtonStyle("archive")}>
            Archive
          </button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={clearCompleted}
            disabled={!visibleTodos.some((t) => t.completed)}
            title="Hide completed tasks and keep them for 30 days"
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: "pointer",
              opacity: visibleTodos.some((t) => t.completed) ? 1 : 0.5,
            }}
          >
            Clear completed
          </button>

          <button
            onClick={clearAllVisible}
            disabled={visibleTodos.length === 0}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: "pointer",
              opacity: visibleTodos.length ? 1 : 0.5,
            }}
          >
            Clear all
          </button>
        </div>
      </div>

      {filter === "calendar" && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
            background: "rgba(0,0,0,0.02)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 12,
              gap: 8,
            }}
          >
            <button
              type="button"
              onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1))}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.2)",
                cursor: "pointer",
                fontFamily: "Arial, sans-serif",
              }}
            >
              ← Prev
            </button>
            <span style={{ fontFamily: "Arial, sans-serif", fontWeight: 600 }}>
              {calendarMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </span>
            <button
              type="button"
              onClick={() => setCalendarMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1))}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid rgba(0,0,0,0.2)",
                cursor: "pointer",
                fontFamily: "Arial, sans-serif",
              }}
            >
              Next →
            </button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: 2,
                textAlign: "center",
                fontSize: 12,
                color: "rgba(0,0,0,0.72)",
                fontFamily: '"Avenir Next", "Helvetica Neue", "Segoe UI", sans-serif',
                fontWeight: 400,
                letterSpacing: 0.2,
              }}
            >
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            {calendarGrid.map((week, wi) => (
              <div
                key={wi}
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: 2,
                }}
              >
                {week.map((day, di) => {
                  const today = new Date()
                  const todayStart = new Date(today)
                  todayStart.setHours(0, 0, 0, 0)
                  const cellDate =
                    day !== null ? new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day) : null
                  const isToday =
                    day !== null &&
                    today.getFullYear() === calendarMonth.getFullYear() &&
                    today.getMonth() === calendarMonth.getMonth() &&
                    today.getDate() === day
                  const isPastDay = cellDate !== null && cellDate.getTime() < todayStart.getTime()
                  const dateKey =
                    day !== null
                      ? `${calendarMonth.getFullYear()}-${String(calendarMonth.getMonth() + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`
                      : null
                  const count = dateKey ? dueCountByDate.get(dateKey) ?? 0 : 0
                  const tasks = dateKey ? dueTasksByDate.get(dateKey) ?? [] : []
                  const dayTitle =
                    day !== null && tasks.length > 0
                      ? `${tasks.length} task${tasks.length === 1 ? "" : "s"} due:\n${tasks.join("\n")}`
                      : undefined
                  return (
                    <div
                      key={di}
                      title={dayTitle}
                      style={{
                        aspectRatio: "1",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 8,
                        border: isToday
                          ? "2px solid #0f172a"
                          : count > 0
                            ? "1px solid rgba(13, 148, 136, 0.45)"
                            : "1px solid transparent",
                        background: isToday
                          ? "rgba(15, 23, 42, 0.22)"
                          : count > 0
                            ? "rgba(13, 148, 136, 0.14)"
                            : isPastDay
                              ? "rgba(0,0,0,0.05)"
                              : "transparent",
                        fontWeight: isToday ? 700 : count > 0 ? 600 : 500,
                        fontSize: 14,
                        fontFamily: "Arial, sans-serif",
                        color: isPastDay ? "rgba(0,0,0,0.45)" : "inherit",
                        textDecoration: isPastDay ? "line-through" : "none",
                        textDecorationColor: isPastDay ? "rgba(0,0,0,0.35)" : "transparent",
                      }}
                    >
                      {day ?? ""}
                      {count > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            color: "#0f766e",
                            marginTop: 1,
                          }}
                        >
                          {count} due
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {filter === "archive" && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            border: "1px solid rgba(0,0,0,0.12)",
            borderRadius: 12,
          }}
        >
          <div style={{ marginBottom: 8, fontWeight: 600 }}>Completed Archive (30 days)</div>
          {archivedTodos.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No archived completed tasks.</div>
          ) : (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {archivedTodos.map((t) => (
                <li
                  key={t.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "8px 10px",
                    border: "1px solid rgba(0,0,0,0.1)",
                    borderRadius: 10,
                    marginBottom: 8,
                  }}
                >
                  <span style={{ flex: 1, minWidth: 0, opacity: 0.75, textDecoration: "line-through" }}>
                    {t.text}
                  </span>
                  <span style={{ fontSize: 12, opacity: 0.7 }}>{formatArchiveRemaining(t.archivedAt)}</span>
                  <button
                    onClick={() => deleteTodo(t.id)}
                    style={{
                      borderRadius: 10,
                      border: "1px solid rgba(0,0,0,0.2)",
                      padding: "6px 10px",
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {filter !== "calendar" && filter !== "archive" && (
        <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
          {filteredTodos.length === 0 ? (
            <li style={{ opacity: 0.7 }}>
              {visibleTodos.length === 0 ? "No tasks yet." : "No tasks in this filter."}
            </li>
          ) : (
            filteredTodos.map((t) => (
              <li
                key={t.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  border: "1px solid rgba(0,0,0,0.12)",
                  borderRadius: 12,
                  marginBottom: 10,
                }}
              >
                <input type="checkbox" checked={t.completed} onChange={() => toggleTodo(t.id)} />
                {editingId === t.id ? (
                  <>
                    <input
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditing(t.id)
                        if (e.key === "Escape") cancelEditing()
                      }}
                      onBlur={() => {
                        if (skipBlurSaveRef.current) {
                          skipBlurSaveRef.current = false
                          return
                        }
                        saveEditing(t.id)
                      }}
                      autoFocus
                      style={{
                        flex: 1,
                        minWidth: 0,
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: "1px solid rgba(0,0,0,0.3)",
                      }}
                    />
                    <input
                      type="datetime-local"
                      value={editingDueDate}
                      onChange={(e) => setEditingDueDate(e.target.value)}
                      min={nowLocalISO()}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: "1px solid rgba(0,0,0,0.2)",
                        fontFamily: "Arial, sans-serif",
                      }}
                    />
                  </>
                ) : (
                  <>
                    <span
                      onDoubleClick={() => startEditing(t)}
                      title="Double click to edit"
                      style={{
                        flex: 1,
                        minWidth: 0,
                        textDecoration: t.completed ? "line-through" : "none",
                        opacity: t.completed ? 0.6 : 1,
                        cursor: "text",
                      }}
                    >
                      {t.text}
                    </span>
                    {t.dueDate && (
                      <span
                        title={`Task: ${t.text}\nDue: ${formatExactDueDate(t.dueDate)}`}
                        style={{
                          fontSize: 12,
                          fontFamily: '"Avenir Next", "Helvetica Neue", "Segoe UI", sans-serif',
                          fontWeight: 400,
                          letterSpacing: 0.1,
                          padding: "2px 8px",
                          borderRadius: 8,
                          background: t.completed
                            ? "rgba(0,0,0,0.08)"
                            : isOverdue(t.dueDate)
                              ? "rgba(180,0,0,0.15)"
                              : "rgba(0,0,0,0.08)",
                          color: !t.completed && isOverdue(t.dueDate) ? "#b91c1c" : "inherit",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {formatDueDate(t.dueDate)}
                      </span>
                    )}
                  </>
                )}
                <button
                  onClick={() => deleteTodo(t.id)}
                  aria-label="Delete"
                  style={{
                    borderRadius: 10,
                    border: "1px solid rgba(0,0,0,0.2)",
                    padding: "6px 10px",
                    cursor: "pointer",
                  }}
                >
                  Delete
                </button>
              </li>
            ))
          )}
        </ul>
      )}

      <div
        style={{
          marginTop: 8,
          padding: "10px 12px",
          border: "1px solid rgba(0,0,0,0.12)",
          borderRadius: 12,
          display: "flex",
          justifyContent: "space-between",
          gap: 10,
          fontSize: 14,
        }}
      >
        <span>Total: {totalCount}</span>
        <span>Completed: {completedCount}</span>
        <span>Remaining: {remainingCount}</span>
        <span>Archived: {archivedTodos.length}</span>
        {overdueCount > 0 && (
          <span style={{ color: "#b91c1c", fontWeight: 600, fontFamily: "Arial, sans-serif" }}>
            Overdue: {overdueCount}
          </span>
        )}
      </div>
    </div>
  )
}
