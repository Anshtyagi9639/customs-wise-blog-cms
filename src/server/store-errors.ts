/**
 * The only two errors the storage layer lets out. Their messages are safe to show: they never contain a connection
 * string, a host name, a user name or a driver message.
 */

/** A unique rule in the database refused the write, for example a slug already used on that website. */
export class StoreConflictError extends Error {
  constructor(public readonly collection: string) {
    super("A record with the same unique value already exists.");
    this.name = "StoreConflictError";
  }
}

/** The database is not configured or could not be reached. */
export class StoreUnavailableError extends Error {
  constructor(message = "The content database could not be reached.") {
    super(message);
    this.name = "StoreUnavailableError";
  }
}
