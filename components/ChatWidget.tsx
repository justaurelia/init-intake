"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import type { ChatState } from "../lib/types";
import type { BotResponse } from "../lib/schema";

const PANEL_WIDTH = 1100;
const PANEL_HEIGHT = 560;
const BREAKPOINT = 700;

function coreFilledCount(state: ChatState): number {
  let n = 0;
  if (state.quantity !== undefined) n++;
  if (state.budgetPerUnitUsd !== undefined) n++;
  if (state.deadlineText !== undefined) n++;
  if (state.shippingType !== undefined) n++;
  if (state.branding !== undefined) n++;
  return n;
}

function shippingLabel(value: string): string {
  if (value === "individual") return "Individual addresses";
  if (value === "bulk") return "Bulk / one location";
  return "Not specified";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

const CheckIcon = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ flexShrink: 0, color: "#666", verticalAlign: "text-bottom" }}
    aria-hidden
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const PATH_CARDS = [
  {
    key: "streamlined" as const,
    title: "Streamlined",
    whatYouGet: ["Prebuilt bundles", "Clear lead time & budget fit", "Minimal coordination"],
    nextSteps: ["Choose a bundle (see below)", "Provide contact details", "Receive confirmation & timeline"],
  },
  {
    key: "assisted" as const,
    title: "Assisted",
    whatYouGet: ["Curated recommendations", "Branding + shipping guidance", "Coordination handled for you"],
    nextSteps: ["We review your brief", "We share curated options", "Confirm details + ship"],
  },
  {
    key: "high_touch" as const,
    title: ["Consultation", "required"],
    whatYouGet: ["Scoping call", "Proposal + timeline", "Dedicated coordination"],
    nextSteps: ["Schedule scoping call", "Proposal + timeline", "Production kickoff"],
  },
] as const;

function briefRows(state: ChatState): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  if (state.quantity !== undefined)
    rows.push({ label: "Quantity", value: String(state.quantity) });
  if (state.budgetPerUnitUsd !== undefined)
    rows.push({ label: "Budget", value: `$${state.budgetPerUnitUsd} / unit` });
  if (state.deadlineText !== undefined)
    rows.push({ label: "Deadline", value: state.deadlineText });
  if (state.shippingType !== undefined)
    rows.push({ label: "Shipping", value: shippingLabel(state.shippingType) });
  if (state.branding !== undefined)
    rows.push({ label: "Branding", value: capitalize(state.branding) });
  if (state.international === true)
    rows.push({ label: "International", value: "Yes" });
  const contactParts: string[] = [];
  if (state.email !== undefined && state.email !== "") contactParts.push(state.email);
  if (state.phone !== undefined && state.phone !== "") contactParts.push(state.phone);
  if (contactParts.length > 0)
    rows.push({ label: "Contact", value: contactParts.join(" · ") });
  return rows;
}

const styles = {
  panelBg: { backgroundColor: "#F5F1EC" },
  primaryText: { color: "#111" },
  secondaryText: { color: "rgba(0,0,0,0.65)" },
  border: { border: "1px solid rgba(0,0,0,0.14)" },
  serif: { fontFamily: "Georgia, serif" },
  body: { fontFamily: "system-ui, sans-serif" },
  button: {
    background: "white",
    border: "1px solid #111",
    borderRadius: 999,
    color: "#111",
    cursor: "pointer",
    padding: "10px 20px",
    fontSize: 14,
  },
  bubbleUser: {
    background: "rgba(0,0,0,0.08)",
    borderRadius: 12,
    padding: "12px 16px",
    maxWidth: "85%",
    marginLeft: "auto",
    marginBottom: 8,
  },
  bubbleAssistant: {
    background: "white",
    border: "1px solid rgba(0,0,0,0.14)",
    borderRadius: 12,
    padding: "12px 16px",
    maxWidth: "85%",
    marginRight: "auto",
    marginBottom: 8,
  },
  bundleCard: {
    background: "white",
    border: "1px solid rgba(0,0,0,0.14)",
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
} as const;

/** Pills for questions with 2–3 options. Each field gets option pills + "Not sure". */
const PILL_OPTIONS: Record<string, Array<{ label: string; message: string }>> = {
  shippingType: [
    { label: "One location (bulk)", message: "One location (bulk)" },
    { label: "Individual addresses", message: "Individual addresses" },
  ],
  international: [
    { label: "Yes", message: "Yes" },
    { label: "No", message: "No" },
  ],
  distributionTiming: [
    { label: "All at once", message: "All at once" },
    { label: "Stored & distributed later", message: "Stored and distributed later" },
  ],
  addressHandling: [
    { label: "We provide addresses", message: "We'll provide the addresses" },
    { label: "You handle collection", message: "You handle collection" },
  ],
  branding: [
    { label: "None", message: "No branding" },
    { label: "Sticker or insert", message: "Sticker or insert" },
    { label: "Laser or embroidery", message: "Laser or embroidery" },
  ],
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [state, setState] = useState<ChatState>({});
  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [lastResponse, setLastResponse] = useState<BotResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [narrow, setNarrow] = useState(false);
  const [briefSent, setBriefSent] = useState(false);
  const [selectedBundleIndex, setSelectedBundleIndex] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setSelectedBundleIndex(null);
  }, [lastResponse]);

  useEffect(() => {
    const check = () => setNarrow(typeof window !== "undefined" && window.innerWidth < BREAKPOINT);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const sendMessage = useCallback(
    async (msg: string) => {
      const text = msg.trim();
      if (!text || loading) return;

      setInput("");
      setError(null);
      const newHistory = [...history, { role: "user" as const, content: text }];
      setHistory(newHistory);
      setLoading(true);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: text,
            state,
            history: newHistory,
          }),
        });

        if (!res.ok) {
          const errBody = await res.text();
          throw new Error(errBody || `HTTP ${res.status}`);
        }

        const data: BotResponse = await res.json();

        setState(data.state);
        setHistory([...newHistory, { role: "assistant", content: data.assistantMessage }]);
        setLastResponse(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    },
    [loading, state, history]
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    const hasEmail = /@/.test(text);
    const hasPhone = /\d{3,}/.test(text);
    // Block send when message looks like an incomplete contact (prefix but no email/phone)
    const contactPrefixes = [
      "my contact is",
      "my email is",
      "my number is",
      "contact is",
      "email is",
      "phone is",
      "number is",
      "contact:",
      "email:",
      "phone:",
    ];
    const looksLikeIncompleteContact = contactPrefixes.some(
      (p) => text.toLowerCase().startsWith(p) && !hasEmail && !hasPhone
    );
    if (looksLikeIncompleteContact) {
      inputRef.current?.focus();
      return;
    }
    sendMessage(input);
  }, [input, sendMessage]);

  const handleRestart = useCallback(() => {
    setInput("");
    setState({});
    setHistory([]);
    setLastResponse(null);
    setError(null);
    setBriefSent(false);
  }, []);

  const handleSendToTeam = useCallback(() => {
    const hasContact = (state.email !== undefined && state.email !== "") ||
      (state.phone !== undefined && state.phone !== "");
    if (!hasContact) {
      setInput("My contact is ");
      setBriefSent(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    } else {
      setBriefSent(true);
    }
  }, [state.email, state.phone]);

  const nextField = lastResponse?.missing?.[0];
  const coreFilled = coreFilledCount(state);
  const showBriefPanel = true;
  const activePath = lastResponse?.mode ?? null;
  const hasContact =
    (state.email !== undefined && state.email !== "") ||
    (state.phone !== undefined && state.phone !== "");
  const pillOptions = nextField && PILL_OPTIONS[nextField];
  const showOptionPills = !loading && pillOptions;

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.key !== "Backspace") return;
      const target = e.target as Node;
      const el = target instanceof HTMLElement ? target : null;
      const isInput = el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (isInput) return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [isOpen]);

  const rows = briefRows(state);

  return (
    <>
      {!isOpen && <div style={{ flex: 1, minHeight: 0 }} />}

      <button
        type="button"
        aria-label="Start a project"
        onClick={() => (isOpen ? handleRestart() : setIsOpen(true))}
        style={{
          fontFamily: "Georgia, serif",
          position: "fixed",
          top: 24,
          right: 24,
          zIndex: 9998,
          display: "inline-flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 24px",
          fontSize: 15,
          fontWeight: 400,
          color: "rgb(255, 255, 255)",
          background: "rgb(33, 33, 33)",
          border: "none",
          borderRadius: 999,
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "#333";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "rgb(33, 33, 33)";
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: "#fff",
            flexShrink: 0,
          }}
          aria-hidden="true"
        />
        <span style={{ textTransform: "lowercase" }}>start a project</span>
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label="Project intake chat"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key !== "Backspace") return;
            const target = e.target as HTMLElement;
            const isInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
            if (isInput) return;
            e.preventDefault();
          }}
          style={{
            flex: 1,
            minHeight: 0,
            width: "100%",
            maxWidth: PANEL_WIDTH,
            alignSelf: "center",
            marginTop: 24,
            ...styles.panelBg,
            ...styles.border,
            display: "flex",
            flexDirection: "column",
            borderRadius: 8,
            overflow: "hidden",
          }}
        >
          <header
            style={{
              padding: "16px 20px",
              ...styles.border,
              borderLeft: "none",
              borderRight: "none",
              borderTop: "none",
              flexShrink: 0,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <h2
                style={{
                  ...styles.serif,
                  ...styles.primaryText,
                  margin: 0,
                  fontSize: 20,
                  fontWeight: 600,
                }}
              >
                Project intake
              </h2>
            </div>
          </header>

          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                flex: 1,
                minHeight: 0,
                display: "flex",
                flexDirection: narrow ? "column" : "row",
                overflow: "hidden",
              }}
            >
            {/* Chat column */}
            <div
              style={{
                ...(narrow ? { flex: "1 1 auto", minHeight: 0, minWidth: 0 } : { width: "50%", flexShrink: 0, minWidth: 0 }),
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                overflow: "hidden",
                ...(narrow ? {} : { ...styles.border, borderTop: "none", borderBottom: "none", borderLeft: "none" }),
              }}
            >
              <div
                style={{
                  flex: 1,
                  overflowX: "hidden",
                  overflowY: "auto",
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                  minWidth: 0,
                }}
              >
                {history.length === 0 && (
                  <p style={{ ...styles.secondaryText, fontSize: 14, margin: 0 }}>
                    Share your project details and we'll suggest options.
                  </p>
                )}
                {history.map((h, i) => (
                  <div
                    key={i}
                    style={{
                      ...(h.role === "user" ? styles.bubbleUser : styles.bubbleAssistant),
                      ...styles.body,
                      fontSize: 14,
                      ...(h.role === "user" ? styles.primaryText : styles.secondaryText),
                    }}
                  >
                    {h.content}
                  </div>
                ))}
                {loading && (
                  <div
                    style={{
                      ...styles.bubbleAssistant,
                      ...styles.body,
                      fontSize: 14,
                      ...styles.secondaryText,
                    }}
                  >
                    …
                  </div>
                )}
                {error && (
                  <div
                    style={{
                      fontSize: 13,
                      color: "rgba(0,0,0,0.7)",
                      background: "rgba(0,0,0,0.06)",
                      padding: 10,
                      borderRadius: 8,
                    }}
                  >
                    {error}
                  </div>
                )}

                {showOptionPills && pillOptions && (
                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    {pillOptions.map((opt, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => sendMessage(opt.message)}
                        style={{
                          ...styles.button,
                          ...styles.primaryText,
                          padding: "8px 16px",
                          fontSize: 13,
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = "rgba(0,0,0,0.05)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = "white";
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => sendMessage("Not sure")}
                      style={{
                        ...styles.button,
                        ...styles.primaryText,
                        padding: "8px 16px",
                        fontSize: 13,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(0,0,0,0.05)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "white";
                      }}
                    >
                      Not sure
                    </button>
                  </div>
                )}
              </div>
              {/* Chat footer: input + send */}
              <div
                style={{
                  padding: 12,
                  ...styles.border,
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: "none",
                  flexShrink: 0,
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
                  placeholder="Type your message…"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: "10px 14px",
                    fontSize: 14,
                    ...styles.border,
                    borderRadius: 999,
                    background: "white",
                    ...styles.primaryText,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={loading || !input.trim()}
                  style={{
                    fontFamily: "Georgia, serif",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    padding: "10px 20px",
                    fontSize: 14,
                    fontWeight: 400,
                    color: loading || !input.trim() ? "rgba(255,255,255,0.6)" : "rgb(255, 255, 255)",
                    background: loading || !input.trim() ? "rgba(33,33,33,0.5)" : "rgb(33, 33, 33)",
                    border: "none",
                    borderRadius: 999,
                    cursor: loading || !input.trim() ? "not-allowed" : "pointer",
                  }}
                  onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled) e.currentTarget.style.background = "#333";
                  }}
                  onMouseLeave={(e) => {
                    if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgb(33, 33, 33)";
                  }}
                >
                  <span
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: "50%",
                      background: loading || !input.trim() ? "rgba(255,255,255,0.6)" : "#fff",
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                  <span style={{ textTransform: "lowercase" }}>send</span>
                </button>
              </div>
            </div>

            {/* Side panel: Your path, Next steps, Project brief, Submit request */}
            {showBriefPanel && (
              <aside
                style={{
                  ...(narrow
                    ? {
                        width: "100%",
                        flex: "1 1 0",
                        minHeight: 0,
                        ...styles.border,
                        borderTop: "none",
                        borderLeft: "none",
                        borderRight: "none",
                      }
                    : { width: "50%", flexShrink: 0, minWidth: 0, minHeight: 0 }),
                  display: "flex",
                  flexDirection: "column",
                  overflow: "hidden",
                  backgroundColor: "#F5F1EC",
                }}
              >
                <div
                style={{
                  flex: 1,
                  minHeight: 0,
                  overflowX: "hidden",
                  overflowY: "auto",
                  padding: 20,
                  minWidth: 0,
                }}
                >
                {/* Your path */}
                <div
                  style={{
                    ...styles.body,
                    fontSize: 11,
                    ...styles.secondaryText,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 8,
                    width: "100%",
                  }}
                >
                  Your path
                </div>
                {activePath === null && (
                  <p
                    style={{
                      ...styles.body,
                      fontSize: 12,
                      ...styles.secondaryText,
                      lineHeight: 1.4,
                      margin: 0,
                      marginBottom: 12,
                    }}
                  >
                    We'll recommend the right path once a few key details are captured.
                  </p>
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: narrow ? "1fr" : "repeat(3, minmax(0, 1fr))",
                    gap: 12,
                    marginBottom: 20,
                    minWidth: 0,
                  }}
                >
                  {PATH_CARDS.map((card) => {
                    const isActive = activePath === card.key;
                    return (
                      <div
                        key={card.key}
                        style={{
                          ...styles.body,
                          background: "white",
                          border: isActive
                            ? "1px solid rgba(0,0,0,0.2)"
                            : "1px solid rgba(0,0,0,0.14)",
                          borderRadius: 8,
                          padding: 14,
                          position: "relative",
                          backgroundColor: isActive ? "rgba(0,0,0,0.04)" : "white",
                          minWidth: 0,
                          overflow: "hidden",
                          overflowWrap: "break-word",
                          wordBreak: "break-word",
                        }}
                      >
                        {isActive && (
                          <span
                            style={{
                              position: "absolute",
                              top: 10,
                              right: 10,
                              fontSize: 10,
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                              ...styles.secondaryText,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "rgba(0,0,0,0.06)",
                            }}
                          >
                            Recommended
                          </span>
                        )}
                        <div
                          style={{
                            ...styles.serif,
                            ...styles.primaryText,
                            fontSize: 15,
                            fontWeight: 600,
                            marginBottom: 4,
                            marginTop: 24,
                            paddingRight: 70,
                            width: "100%",
                            boxSizing: "border-box",
                            minHeight: Array.isArray(card.title) ? undefined : 36,
                          }}
                        >
                          {Array.isArray(card.title) ? (
                            card.title.map((line, i) => (
                              <div key={i} style={{ whiteSpace: "nowrap" }}>
                                {line}
                              </div>
                            ))
                          ) : (
                            <span style={{ whiteSpace: "nowrap" }}>{card.title}</span>
                          )}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            ...styles.secondaryText,
                            marginTop: 10,
                          }}
                        >
                          {card.whatYouGet.map((item, i) => (
                            <div
                              key={i}
                              style={{
                                marginBottom: 2,
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 7,
                              }}
                            >
                              <CheckIcon />
                              <span>{item}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Next steps */}
                <div
                  style={{
                    ...styles.body,
                    fontSize: 11,
                    ...styles.secondaryText,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 8,
                  }}
                >
                  {activePath ? "Next steps for your project" : "What happens next"}
                </div>
                {activePath === null ? (
                  <p
                    style={{
                      ...styles.body,
                      fontSize: 13,
                      ...styles.secondaryText,
                      lineHeight: 1.4,
                      margin: 0,
                      marginBottom: 20,
                      paddingBottom: 20,
                      borderBottom: "1px solid rgba(0,0,0,0.1)",
                    }}
                  >
                    Add a few details and we'll route you to the right level of support.
                  </p>
                ) : (
                  <ol
                    style={{
                      ...styles.body,
                      fontSize: 13,
                      ...styles.primaryText,
                      lineHeight: 1.5,
                      margin: 0,
                      marginBottom: 20,
                      paddingLeft: 18,
                      paddingBottom: 20,
                      borderBottom: "1px solid rgba(0,0,0,0.1)",
                    }}
                  >
                    {PATH_CARDS.find((c) => c.key === activePath)?.nextSteps.map((step, i) => (
                      <li key={i} style={{ marginBottom: 4 }}>
                        {step}
                      </li>
                    ))}
                  </ol>
                )}

                {/* Project brief */}
                <div
                  style={{
                    ...styles.body,
                    fontSize: 11,
                    ...styles.secondaryText,
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: 14,
                  }}
                >
                  Project brief
                </div>
                <div
                  style={{
                    background: "white",
                    ...styles.border,
                    borderRadius: 8,
                    padding: "14px 16px",
                    minWidth: 0,
                    overflow: "hidden",
                  }}
                >
                  {rows.map((row, i) => (
                    <div
                      key={i}
                      style={{
                        ...styles.body,
                        fontSize: 13,
                        paddingTop: i === 0 ? 0 : 10,
                        paddingBottom: 10,
                        borderTop: i === 0 ? "none" : "1px solid rgba(0,0,0,0.08)",
                      }}
                    >
                      <div style={{ ...styles.secondaryText, fontSize: 11, marginBottom: 2 }}>
                        {row.label}
                      </div>
                      <div style={{ ...styles.primaryText, overflowWrap: "break-word", wordBreak: "break-word" }}>
                        {row.value}
                      </div>
                    </div>
                  ))}
                </div>

                {lastResponse?.bundleSuggestions && lastResponse.bundleSuggestions.length > 0 && (
                  <>
                    <div
                      style={{
                        ...styles.body,
                        fontSize: 11,
                        ...styles.secondaryText,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginBottom: 14,
                        marginTop: 20,
                      }}
                    >
                      Suggested bundles
                    </div>
                    <div
                      style={{
                        background: "transparent",
                        minWidth: 0,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        gap: 8,
                      }}
                    >
                      {lastResponse.bundleSuggestions.map((b, i) => {
                        const isSelected = selectedBundleIndex === i;
                        return (
                          <button
                            key={i}
                            type="button"
                            onClick={() => setSelectedBundleIndex(i)}
                            style={{
                              ...styles.body,
                              fontSize: 13,
                              padding: "14px 16px",
                              paddingRight: 56,
                              textAlign: "left",
                              cursor: "pointer",
                              border: isSelected
                                ? "1px solid rgba(0,0,0,0.2)"
                                : "1px solid rgba(0,0,0,0.14)",
                              borderRadius: 8,
                              background: isSelected ? "rgba(0,0,0,0.04)" : "white",
                              position: "relative",
                              outline: "none",
                            }}
                            onMouseEnter={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = "rgba(0,0,0,0.02)";
                                e.currentTarget.style.borderColor = "rgba(0,0,0,0.18)";
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isSelected) {
                                e.currentTarget.style.background = "white";
                                e.currentTarget.style.borderColor = "rgba(0,0,0,0.14)";
                              }
                            }}
                          >
                            {isSelected && (
                              <span
                                style={{
                                  position: "absolute",
                                  top: 10,
                                  right: 10,
                                  fontSize: 10,
                                  textTransform: "uppercase",
                                  letterSpacing: "0.04em",
                                  ...styles.secondaryText,
                                  padding: "2px 6px",
                                  borderRadius: 4,
                                  background: "rgba(0,0,0,0.06)",
                                }}
                              >
                                Selected
                              </span>
                            )}
                            <div style={{ ...styles.primaryText, fontWeight: 600, marginBottom: 2 }}>
                              {b.name}
                            </div>
                            <div style={{ ...styles.secondaryText, fontSize: 12 }}>
                              ${b.unitPrice} per unit · {b.leadTimeDays} days lead time
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}

                </div>
                {/* Submit request cell below project brief */}
                <div
                  style={{
                    padding: 12,
                    ...styles.border,
                    borderLeft: "none",
                    borderRight: "none",
                    borderBottom: "none",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: "#F5F1EC",
                  }}
                >
                  {briefSent ? (
                    <div
                      style={{
                        fontFamily: "Georgia, serif",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        padding: "10px 20px",
                        fontSize: 14,
                        fontWeight: 400,
                        color: "rgb(255, 255, 255)",
                        background: "rgb(33, 33, 33)",
                        borderRadius: 999,
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: "#fff",
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      />
                      <span style={{ textTransform: "lowercase" }}>submitted</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={handleSendToTeam}
                      disabled={!hasContact}
                      title={!hasContact ? "fill your contact info to proceed" : undefined}
                      style={{
                        fontFamily: "Georgia, serif",
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        padding: "10px 20px",
                        fontSize: 14,
                        fontWeight: 400,
                        color: !hasContact ? "rgba(255,255,255,0.6)" : "rgb(255, 255, 255)",
                        background: !hasContact ? "rgba(33,33,33,0.5)" : "rgb(33, 33, 33)",
                        border: "none",
                        borderRadius: 999,
                        cursor: !hasContact ? "not-allowed" : "pointer",
                      }}
                      onMouseEnter={(e) => {
                        if (!e.currentTarget.disabled) e.currentTarget.style.background = "#333";
                      }}
                      onMouseLeave={(e) => {
                        if (!e.currentTarget.disabled) e.currentTarget.style.background = "rgb(33, 33, 33)";
                      }}
                    >
                      <span
                        style={{
                          width: 5,
                          height: 5,
                          borderRadius: "50%",
                          background: !hasContact ? "rgba(255,255,255,0.6)" : "#fff",
                          flexShrink: 0,
                        }}
                        aria-hidden="true"
                      />
                      <span style={{ textTransform: "lowercase" }}>Submit request</span>
                    </button>
                  )}
                </div>
              </aside>
            )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
