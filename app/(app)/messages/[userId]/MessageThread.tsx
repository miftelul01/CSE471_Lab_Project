"use client";

import { useCallback, useEffect, useState } from "react";

import { buttonClass, Card, ErrorNote, inputClass } from "@/components/ui";

type Message = { id: string; senderId: string; recipientId: string; body: string; createdAt: string };

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function MessageThread({ otherUserId, currentUserId }: { otherUserId: string; currentUserId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/messages?with=${otherUserId}`);
    const body = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(body.error ?? "Could not load messages");
      return;
    }
    setMessages(body.messages ?? []);
  }, [otherUserId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    setError(null);
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient_id: otherUserId, body: draft.trim() }),
    });
    const body = await res.json();
    setSending(false);
    if (!res.ok) {
      setError(body.error ?? "Could not send message");
      return;
    }
    setDraft("");
    void load();
  }

  if (loading) return <p className="text-sm text-slate-500">Loading…</p>;

  return (
    <div className="space-y-4">
      {error ? <ErrorNote>{error}</ErrorNote> : null}
      <Card className="max-h-[60vh] space-y-2 overflow-y-auto">
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">No messages yet — say hello.</p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${
                    mine ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-800"
                  }`}
                >
                  <p>{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-slate-400"}`}>
                    {formatTime(m.createdAt)}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </Card>
      <form onSubmit={send} className="flex gap-2">
        <input
          className={inputClass}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a message…"
          disabled={sending}
        />
        <button type="submit" className={buttonClass} disabled={sending || !draft.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
