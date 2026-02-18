"use client";

import React, { useState, useCallback, useEffect, useRef } from "react";
import type { ChatState } from "../lib/types";
import type { BotResponse } from "../lib/schema";

const PANEL_WIDTH = 860;
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

function getQualificationStatus(
  coreFilled: number,
  mode: "streamlined" | "assisted" | "high_touch" | undefined
): { label: string; dotColor: string } {
  if (coreFilled < 4) {
    return { label: "Qualification in progress", dotColor: "rgba(0,0,0,0.35)" };
  }
  if (mode === "streamlined") {
    return { label: "Qualified — streamlined path", dotColor: "rgba(80,100,80,0.85)" };
  }
  if (mode === "assisted") {
    return { label: "Qualified — assisted by our sales team", dotColor: "rgba(140,100,60,0.9)" };
  }
  if (mode === "high_touch") {
    return { label: "Consultation required", dotColor: "rgba(120,70,70,0.85)" };
  }
  return { label: "Qualification in progress", dotColor: "rgba(0,0,0,0.35)" };
}

function shippingLabel(value: string): string {
  if (value === "individual") return "Individual addresses";
  if (value === "bulk") return "Bulk / one location";
  return "Not specified";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

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
  const inputRef = useRef<HTMLInputElement>(null);

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
  const qualificationStatus = getQualificationStatus(coreFilled, lastResponse?.mode ?? "streamlined");
  const showShippingPills = !loading && nextField === "shippingType";

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
            maxWidth: 860,
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
              flexDirection: narrow ? "column" : "row",
              overflow: "hidden",
            }}
          >
            {/* Chat column */}
            <div
              style={{
                ...(narrow ? { flex: "1 1 auto", minHeight: 0 } : { width: "50%", flexShrink: 0 }),
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                ...(narrow ? {} : { ...styles.border, borderTop: "none", borderBottom: "none", borderLeft: "none" }),
              }}
            >
              <div
                style={{
                  flex: 1,
                  overflow: "auto",
                  padding: 16,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
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

                {lastResponse?.bundleSuggestions && lastResponse.bundleSuggestions.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <div
                      style={{
                        ...styles.body,
                        fontSize: 12,
                        ...styles.secondaryText,
                        marginBottom: 8,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      Suggested options
                    </div>
                    {lastResponse.bundleSuggestions.map((b, i) => (
                      <div key={i} style={styles.bundleCard}>
                        <div style={{ ...styles.primaryText, fontWeight: 600, marginBottom: 4 }}>
                          {b.name}
                        </div>
                        <div style={{ ...styles.secondaryText, fontSize: 13, marginBottom: 2 }}>
                          ${b.unitPrice} per unit · {b.leadTimeDays} days lead time
                        </div>
                        {b.why && (
                          <div style={{ ...styles.secondaryText, fontSize: 12, marginTop: 6 }}>
                            {b.why}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {lastResponse?.leadCaptured && (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 12,
                      ...styles.secondaryText,
                      fontStyle: "italic",
                    }}
                  >
                    Project brief saved.
                  </div>
                )}

                {showShippingPills && (
                  <div
                    style={{
                      marginTop: 12,
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => sendMessage("One location (bulk)")}
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
                      One location (bulk)
                    </button>
                    <button
                      type="button"
                      onClick={() => sendMessage("Individual addresses")}
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
                      Individual addresses
                    </button>
                  </div>
                )}
              </div>

              <div
                style={{
                  padding: 12,
                  ...styles.border,
                  borderLeft: "none",
                  borderRight: "none",
                  borderBottom: narrow ? "none" : undefined,
                  display: "flex",
                  gap: 8,
                  flexShrink: 0,
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

            {/* Side panel: How this works, Qualification status, Project brief */}
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
                    overflow: "auto",
                    padding: 20,
                  }}
                >
                {/* Section 1 — How this works */}
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
                  How this works
                </div>
                <p
                  style={{
                    ...styles.body,
                    fontSize: 13,
                    ...styles.secondaryText,
                    lineHeight: 1.55,
                    margin: 0,
                    marginBottom: 20,
                    paddingBottom: 20,
                    borderBottom: "1px solid rgba(0,0,0,0.1)",
                  }}
                >
                  We structure your request to understand scope, budget, and operational complexity
                  before routing it to the right path. This helps reduce coordination time and
                  ensures the appropriate team reviews your project.
                </p>

                {/* Section 2 — Qualification status */}
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
                  Qualification status
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 20,
                    paddingBottom: 20,
                    borderBottom: "1px solid rgba(0,0,0,0.1)",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: qualificationStatus.dotColor,
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  />
                  <span style={{ ...styles.primaryText, fontSize: 13 }}>
                    {qualificationStatus.label}
                  </span>
                </div>

                {/* Section 3 — Project brief */}
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

                <button
                  type="button"
                  onClick={handleSendToTeam}
                  style={{
                    fontFamily: "Georgia, serif",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    marginTop: 14,
                    width: "100%",
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
                  <span style={{ textTransform: "lowercase" }}>send to the team</span>
                </button>
                {briefSent && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      ...styles.secondaryText,
                      fontStyle: "italic",
                    }}
                  >
                    Project sent — we'll follow up.
                  </div>
                )}
                </div>
              </aside>
            )}
          </div>
        </div>
      )}
    </>
  );
}
