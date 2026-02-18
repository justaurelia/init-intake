import React from "react";
import ChatWidget from "../components/ChatWidget";

export default function Home() {
  return (
    <div
      style={{
        height: "100vh",
        width: "100vw",
        boxSizing: "border-box",
        overflow: "hidden",
        backgroundColor: "#F5F1EC",
        padding: "24px",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ maxWidth: 640, margin: 0, flexShrink: 0, marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: "Georgia, serif",
            fontSize: "clamp(1.5rem, 4vw, 2.5rem)",
            fontWeight: 600,
            color: "#111",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          Project intake, streamlined.
        </h1>
        <p
          style={{
            fontFamily: "system-ui, sans-serif",
            fontSize: 16,
            color: "rgba(0,0,0,0.65)",
            marginTop: 12,
            marginBottom: 0,
          }}
        >
          Prototype conversational qualification flow.
        </p>
      </div>
      <ChatWidget />
    </div>
  );
}
