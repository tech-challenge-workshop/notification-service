import { TerminalEventDto } from './terminal-event.dto';

// The consumed contract carries the field as an optional string. The shape
// is proven at compile time by `npm run typecheck`, which covers this file
// (ts-jest only transpiles here, under isolatedModules): the literals below
// stop compiling if the DTO loses the field, if it becomes required, or if
// it accepts a non-string.
describe('TerminalEventDto', () => {
  it('carries an optional string correlationId', () => {
    const base = {
      eventId: 'e-1',
      processingRequestId: 'pr-1',
      ownerUserId: 'u-1',
      ownerEmail: 'owner@example.com',
      status: 'COMPLETED' as const,
      zipStorageKey: 'zips/pr-1.zip',
      occurredAt: '2026-09-28T00:00:00.000Z',
    };
    const withId = {
      ...base,
      correlationId: 'n-9',
    } satisfies TerminalEventDto;
    const withoutId: TerminalEventDto = base;
    const numeric: TerminalEventDto = {
      ...base,
      // @ts-expect-error correlationId is a string, never a number
      correlationId: 9,
    };

    expect(withId.correlationId).toBe('n-9');
    expect('correlationId' in withoutId).toBe(false);
    // Compile-time only: the numeric id above must fail to type-check.
    void numeric;
  });
});
