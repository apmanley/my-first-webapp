import { useEffect, useMemo, useRef, useState } from "react"

type Todo = {
  id: string
  text: string
  completed: boolean
}

type Filter = "all" | "active" | "completed"

const STORAGE_KEY = "todos:v1"

function makeId() {
  // Good enough for a small local app
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export default function App() {
  const [text, setText] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingText, setEditingText] = useState("")
  const skipBlurSaveRef = useRef(false)
  const [todos, setTodos] = useState<Todo[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      return raw ? (JSON.parse(raw) as Todo[]) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(todos))
  }, [todos])

  const remainingCount = useMemo(
    () => todos.filter((t) => !t.completed).length,
    [todos]
  )
  const completedCount = todos.length - remainingCount
  const totalCount = todos.length

  const filteredTodos = useMemo(() => {
    if (filter === "active") return todos.filter((t) => !t.completed)
    if (filter === "completed") return todos.filter((t) => t.completed)
    return todos
  }, [filter, todos])

  function addTodo() {
    const trimmed = text.trim()
    if (!trimmed) return

    setTodos((prev) => [
      { id: makeId(), text: trimmed, completed: false },
      ...prev,
    ])
    setText("")
  }

  function toggleTodo(id: string) {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    )
  }

  function deleteTodo(id: string) {
    setTodos((prev) => prev.filter((t) => t.id !== id))
  }

  function clearCompleted() {
    setTodos((prev) => prev.filter((t) => !t.completed))
  }

  function startEditing(todo: Todo) {
    setEditingId(todo.id)
    setEditingText(todo.text)
  }

  function cancelEditing() {
    skipBlurSaveRef.current = true
    setEditingId(null)
    setEditingText("")
  }

  function saveEditing(id: string) {
    const trimmed = editingText.trim()

    if (!trimmed) {
      setEditingId(null)
      setEditingText("")
      return
    }

    setTodos((prev) => prev.map((t) => (t.id === id ? { ...t, text: trimmed } : t)))
    setEditingId(null)
    setEditingText("")
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
      <p style={{ marginTop: 0, opacity: 0.8 }}>
        {remainingCount} remaining
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          addTodo()
        }}
        style={{ display: "flex", gap: 8, marginBottom: 16 }}
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a task..."
          style={{
            flex: 1,
            padding: "10px 12px",
            borderRadius: 10,
            border: "1px solid rgba(0,0,0,0.2)",
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
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => setFilter("all")}
            aria-pressed={filter === "all"}
            style={filterButtonStyle("all")}
          >
            All
          </button>
          <button
            onClick={() => setFilter("active")}
            aria-pressed={filter === "active"}
            style={filterButtonStyle("active")}
          >
            Active
          </button>
          <button
            onClick={() => setFilter("completed")}
            aria-pressed={filter === "completed"}
            style={filterButtonStyle("completed")}
          >
            Completed
          </button>
        </div>

        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={clearCompleted}
            disabled={!todos.some((t) => t.completed)}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: "pointer",
              opacity: todos.some((t) => t.completed) ? 1 : 0.5,
            }}
          >
            Clear completed
          </button>

          <button
            onClick={() => setTodos([])}
            disabled={todos.length === 0}
            style={{
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.2)",
              cursor: "pointer",
              opacity: todos.length ? 1 : 0.5,
            }}
          >
            Clear all
          </button>
        </div>
      </div>

      <ul style={{ listStyle: "none", padding: 0, marginTop: 16 }}>
        {filteredTodos.length === 0 ? (
          <li style={{ opacity: 0.7 }}>
            {todos.length === 0 ? "No tasks yet." : "No tasks in this filter."}
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
              <input
                type="checkbox"
                checked={t.completed}
                onChange={() => toggleTodo(t.id)}
              />
              {editingId === t.id ? (
                <input
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      saveEditing(t.id)
                    }
                    if (e.key === "Escape") {
                      cancelEditing()
                    }
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
                    padding: "6px 8px",
                    borderRadius: 8,
                    border: "1px solid rgba(0,0,0,0.3)",
                  }}
                />
              ) : (
                <span
                  onDoubleClick={() => startEditing(t)}
                  title="Double click to edit"
                  style={{
                    flex: 1,
                    textDecoration: t.completed ? "line-through" : "none",
                    opacity: t.completed ? 0.6 : 1,
                    cursor: "text",
                  }}
                >
                  {t.text}
                </span>
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
      </div>
    </div>
  )
}
