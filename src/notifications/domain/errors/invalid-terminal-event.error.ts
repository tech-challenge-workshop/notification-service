/**
 * Why a terminal event could not be acted on.
 *
 * A closed union: a new violation must be named here, so it cannot be
 * reported under a generic code that callers cannot distinguish.
 */
export type InvalidTerminalEventCode =
  | 'INVALID_TERMINAL_STATUS'
  | 'MISSING_PROCESSING_REQUEST_ID'
  | 'MISSING_ZIP_STORAGE_KEY'
  | 'MISSING_FAILURE_REASON'
  | 'AMBIGUOUS_TERMINAL_OUTCOME'
  | 'INVALID_TERMINAL_EVENT';

export class InvalidTerminalEventError extends Error {
  public readonly code: InvalidTerminalEventCode;

  constructor(
    message: string,
    code: InvalidTerminalEventCode = 'INVALID_TERMINAL_EVENT',
  ) {
    super(message);
    this.name = InvalidTerminalEventError.name;
    this.code = code;
  }
}
