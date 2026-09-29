// Runs in every e2e worker before any suite (jest `setupFiles`). The apps the
// suites boot log through pino; keep the run quiet unless a caller asks for a
// level explicitly.
process.env.LOG_LEVEL ??= 'fatal';
