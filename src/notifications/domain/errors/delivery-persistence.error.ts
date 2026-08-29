export class DeliveryPersistenceError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = DeliveryPersistenceError.name;
    this.cause = cause;
  }
}
