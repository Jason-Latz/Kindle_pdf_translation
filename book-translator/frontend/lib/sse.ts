export type EventMessage = {
  stage: string;
  pct: number;
  detail?: string;
};

export function connectToSSE(url: string, onMessage: (msg: EventMessage) => void): EventSource {
  const source = new EventSource(url);
  source.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data) as EventMessage;
      onMessage(data);
    } catch (err) {
      console.error("Failed to parse SSE message", err);
    }
  };
  return source;
}
