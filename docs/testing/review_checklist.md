# Review Checklist — Backend Code



## Correctness
- [ ] Input validation is explicit and error messages are actionable.
- [ ] Edge cases are covered (empty inputs, missing files, invalid metadata).
- [ ] Output artifacts are deterministic for the same input.

## Reliability & Resilience
- [ ] External dependencies are mocked or isolated in tests.
- [ ] Errors are surfaced with consistent status updates.
- [ ] Retry-safe behavior is preserved for background jobs.

## Observability
- [ ] Telemetry/logging includes stage timings and identifiers.
- [ ] Logs avoid leaking sensitive data (API keys, document content).

## Performance
- [ ] Hot paths avoid unnecessary I/O or repeated work.
- [ ] Background tasks run off the event loop when blocking.

## Maintainability
- [ ] Functions are small, single-purpose, and documented.
- [ ] Tests exist for new behaviors with clear assertions.
