import { correlationContext } from '../observability/correlation-context';
import { withMessageCorrelation } from './with-correlation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('withMessageCorrelation (OBS-46, OBS-47)', () => {
  const seenBy = async (content: string): Promise<string | undefined> => {
    let seen: string | undefined;
    await withMessageCorrelation(content, () => {
      seen = correlationContext.getCorrelationId();
      return Promise.resolve();
    });
    return seen;
  };

  it("sets the context from a flat body's correlationId before handling", async () => {
    expect(
      await seenBy(JSON.stringify({ eventId: 'e-1', correlationId: 'n-9' })),
    ).toBe('n-9');
  });

  it('reads the id inside the Nest data envelope, trimmed', async () => {
    expect(
      await seenBy(
        JSON.stringify({
          pattern: 'terminal.event',
          data: { eventId: 'e-1', correlationId: '  n-9  ' },
        }),
      ),
    ).toBe('n-9');
  });

  it('clears the context once the handler has settled', async () => {
    await withMessageCorrelation(JSON.stringify({ correlationId: 'n-9' }), () =>
      Promise.resolve(),
    );

    expect(correlationContext.getCorrelationId()).toBeUndefined();
  });

  it('clears the context when the handler throws, and rethrows', async () => {
    await expect(
      withMessageCorrelation(JSON.stringify({ correlationId: 'n-9' }), () =>
        Promise.reject(new Error('boom')),
      ),
    ).rejects.toThrow('boom');

    expect(correlationContext.getCorrelationId()).toBeUndefined();
  });

  it('generates a fresh id when the event has none, and still runs the handler', async () => {
    const handler = jest.fn(() => Promise.resolve('handled'));

    const result = await withMessageCorrelation(
      JSON.stringify({ pattern: 'terminal.event', data: { eventId: 'e-1' } }),
      handler,
    );
    const seen = await seenBy(
      JSON.stringify({ pattern: 'terminal.event', data: { eventId: 'e-1' } }),
    );

    expect(handler).toHaveBeenCalledTimes(1);
    expect(result).toBe('handled');
    expect(seen).toMatch(UUID);
  });

  it.each<[string, unknown]>([
    ['a number', 123],
    ['an object', { id: 'n-9' }],
    ['null', null],
    ['a blank string', '   '],
    ['129 characters', 'a'.repeat(129)],
    ['a non-printable character', 'n\n9'],
  ])(
    'replaces %s with a generated id, never coercing it (L-010)',
    async (_label, correlationId) => {
      const seen = await seenBy(
        JSON.stringify({
          pattern: 'terminal.event',
          data: { eventId: 'e-1', correlationId },
        }),
      );

      expect(seen).toMatch(UUID);
      expect(seen).not.toBe('null');
      expect(seen).not.toBe('123');
    },
  );

  // V58 regression-watch: the wrapper only sets the context. A `data: null`
  // or non-JSON message still reaches the handler, whose own rejection (the
  // consumer's dead-letter path) passes through unchanged.
  it.each<[string, string]>([
    ['data: null', JSON.stringify({ pattern: 'terminal.event', data: null })],
    ['a body that is not JSON', '{not json'],
  ])(
    'runs the handler for %s under a generated id and passes its rejection through',
    async (_label, content) => {
      const rejection = new Error('malformed');
      let seen: string | undefined;

      await expect(
        withMessageCorrelation(content, () => {
          seen = correlationContext.getCorrelationId();
          return Promise.reject(rejection);
        }),
      ).rejects.toBe(rejection);

      expect(seen).toMatch(UUID);
    },
  );

  it('gives two messages without an id two different ids', async () => {
    const first = await seenBy('{}');
    const second = await seenBy('{}');

    expect(first).toMatch(UUID);
    expect(second).toMatch(UUID);
    expect(first).not.toBe(second);
  });
});
