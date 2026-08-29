import { InvalidTerminalEventError } from './invalid-terminal-event.error';

describe('InvalidTerminalEventError', () => {
  it('should extend Error and carry INVALID_TERMINAL_STATUS code', () => {
    const error = new InvalidTerminalEventError(
      'Invalid terminal status: PROCESSING',
      'INVALID_TERMINAL_STATUS',
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(InvalidTerminalEventError);
    expect(error.name).toBe(InvalidTerminalEventError.name);
    expect(error.message).toBe('Invalid terminal status: PROCESSING');
    expect(error.code).toBe('INVALID_TERMINAL_STATUS');
  });

  it('should carry MISSING_PROCESSING_REQUEST_ID code', () => {
    const error = new InvalidTerminalEventError(
      'Missing processingRequestId',
      'MISSING_PROCESSING_REQUEST_ID',
    );

    expect(error.code).toBe('MISSING_PROCESSING_REQUEST_ID');
  });

  it('should default to INVALID_TERMINAL_EVENT code', () => {
    const error = new InvalidTerminalEventError('Malformed event');

    expect(error.code).toBe('INVALID_TERMINAL_EVENT');
  });
});
