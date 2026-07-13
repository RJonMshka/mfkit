import { useState } from "react";

export interface HelloViewProps {
  readonly greeting?: string | undefined;
  readonly basePath: string;
}

export function Hello({ greeting, basePath }: HelloViewProps) {
  const [count, setCount] = useState(0);
  return (
    <div style={{ padding: "1rem", border: "1px solid #ccc", borderRadius: 8 }}>
      <p>
        {greeting ?? "Hello"} — I am a federated React MFE mounted at <code>{basePath}</code>.
      </p>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Clicked {count} time{count === 1 ? "" : "s"}
      </button>
    </div>
  );
}
