import { DeliveryPersistenceError } from './delivery-persistence.error';

describe('DeliveryPersistenceError', () => {
  it('should extend Error and carry a cause', () => {
    const cause = new Error('Database unavailable');
    const error = new DeliveryPersistenceError(
      'Failed to save delivery',
      cause,
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(DeliveryPersistenceError);
    expect(error.name).toBe(DeliveryPersistenceError.name);
    expect(error.message).toBe('Failed to save delivery');
    expect(error.cause).toBe(cause);
  });

  it('should allow an undefined cause', () => {
    const error = new DeliveryPersistenceError('Unexpected failure');

    expect(error.cause).toBeUndefined();
  });
});
