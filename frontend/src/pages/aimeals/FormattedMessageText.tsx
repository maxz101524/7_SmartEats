export function FormattedMessageText({ text }: { text: string }) {
  const lines = text.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const blocks: React.ReactNode[] = [];
  let bulletBuffer: string[] = [];

  const flushBullets = () => {
    if (bulletBuffer.length === 0) return;
    blocks.push(
      <ul key={`list-${blocks.length}`} style={{ margin: "8px 0 0", paddingLeft: 18 }}>
        {bulletBuffer.map((line) => (
          <li key={line} style={{ marginTop: 4 }}>{line.replace(/^[-*]\s*/, "")}</li>
        ))}
      </ul>,
    );
    bulletBuffer = [];
  };

  lines.forEach((line) => {
    if (/^[-*]\s+/.test(line)) {
      bulletBuffer.push(line);
      return;
    }
    flushBullets();
    blocks.push(
      <p key={`p-${blocks.length}`} style={{ margin: blocks.length === 0 ? 0 : "8px 0 0" }}>
        {line}
      </p>,
    );
  });
  flushBullets();

  return <>{blocks}</>;
}
