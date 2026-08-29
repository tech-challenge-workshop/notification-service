export class InvalidTerminalEventError extends Error {
  public readonly code:
    | 'INVALID_TERMINAL_STATUS'
    | 'MISSING_PROCESSING_REQUEST_ID'
    | 'INVALID_TERMINAL_EVENT';

  constructor(
    message: string,
    code:
      | 'INVALID_TERMINAL_STATUS'
      | 'MISSING_PROCESSING_REQUEST_ID'
      | 'INVALID_TERMINAL_EVENT' = 'INVALID_TERMINAL_EVENT',
  ) {
    super(message);
    this.name = InvalidTerminalEventError.name;
    this.code = code;
  }
}
