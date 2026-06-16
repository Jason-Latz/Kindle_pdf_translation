import { describe, expect, it } from 'vitest'

import { isTerminalJobStatus, shouldPollJobStatus } from '../lib/job-polling'

describe('job polling helpers', () => {
  it('treats done and error states as terminal', () => {
    expect(isTerminalJobStatus('done')).toBe(true)
    expect(isTerminalJobStatus('error')).toBe(true)
    expect(isTerminalJobStatus('processing')).toBe(false)
  })

  it('polls only visible active jobs without client-side errors', () => {
    expect(
      shouldPollJobStatus(
        {
          job_id: 'job_123',
          status: 'processing',
        },
        false,
        'visible',
      ),
    ).toBe(true)

    expect(
      shouldPollJobStatus(
        {
          job_id: 'job_123',
          status: 'processing',
        },
        false,
        'hidden',
      ),
    ).toBe(false)

    expect(
      shouldPollJobStatus(
        {
          job_id: 'job_123',
          status: 'done',
        },
        false,
        'visible',
      ),
    ).toBe(false)

    expect(
      shouldPollJobStatus(
        {
          job_id: 'job_123',
          status: 'processing',
        },
        true,
        'visible',
      ),
    ).toBe(false)
  })
})
