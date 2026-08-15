export { ContactList } from './views/ContactList.2x2.tsx'
export { ContactCard } from './views/ContactCard.1x1.tsx'
export { ContactsApp } from './views/ContactsApp.tsx'
export { useContacts } from './contactsStore.ts'
export { usePreparedMessage } from './preparedStore.ts'
export {
  useContactTodos,
  listContactTodos,
  addContactTodo,
  type ContactTodo,
  type ContactTodosApi,
} from './contactTodos.ts'
export { makeJsonContactsAdapter } from './adapters/exampleJsonAdapter.ts'
