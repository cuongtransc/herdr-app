// Messages sent mid-turn that the agent has not read yet: they reach the transcript only when
// it reads them, so until then they sit here, above the working line, the way the CLI shows them.
export function QueuedMessages({ texts }: { texts: string[] }) {
  if (texts.length === 0) return null;
  return (
    <ul className="chat-queued" aria-label="Queued messages">
      {texts.map((text, i) => (
        <li key={i} className="chat-row chat-user">
          <div className="chat-user-line">
            <span className="chat-queued-label">Queued</span>
            <div className="chat-bubble">{text}</div>
          </div>
        </li>
      ))}
    </ul>
  );
}
