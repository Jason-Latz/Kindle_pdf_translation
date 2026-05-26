export function isTerminalJobStatus(
  status: string | null | undefined,
): boolean {
  return status === 'done' || status === 'error'
}

export function shouldPollJobStatus(
  status: { job_id: string; status: string } | null,
  hasError: boolean,
  visibilityState: DocumentVisibilityState,
): boolean {
  return visibilityState === 'visible' && Boolean(status?.job_id) && !hasError && !isTerminalJobStatus(status?.status)
}
