/**
 * Keeps a cached IndexedDB handle from surviving a version change or an
 * externally closed connection. Callers can retry init() on the next access.
 */
export function attachIndexedDbLifecycle(database: IDBDatabase, onInvalidated: () => void): void {
  database.onversionchange = () => {
    database.close();
    onInvalidated();
  };
  database.onclose = () => {
    onInvalidated();
  };
}
