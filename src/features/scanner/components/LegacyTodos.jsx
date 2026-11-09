export default function LegacyTodos({ todoStatus, todos }) {
  return (
    <details className="existing-todos">
      <summary>Existing Supabase todos</summary>
      {todoStatus ? (
        <p>{todoStatus}</p>
      ) : todos.length ? (
        <ul>
          {todos.map((todo) => (
            <li key={todo.id}>{todo.name}</li>
          ))}
        </ul>
      ) : (
        <p>No todos found.</p>
      )}
    </details>
  )
}
