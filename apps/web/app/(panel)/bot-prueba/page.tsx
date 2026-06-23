'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

interface Msg {
  role: 'user' | 'bot';
  text: string;
}

export default function BotPruebaPage() {
  const [sessionId] = useState(() => 'sim-' + Date.now());
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMsgs((m) => [...m, { role: 'user', text }]);
    setBusy(true);
    try {
      const res = await api<{ reply: string }>('/whatsapp/simulate', {
        method: 'POST',
        body: JSON.stringify({ sessionId, text }),
      });
      setMsgs((m) => [...m, { role: 'bot', text: res.reply }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: 'bot', text: '⚠️ ' + (e as Error).message }]);
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    await api('/whatsapp/simulate/reset', {
      method: 'POST',
      body: JSON.stringify({ sessionId }),
    }).catch(() => {});
    setMsgs([]);
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">🤖 Probar el bot de WhatsApp</h1>
        <button
          onClick={reset}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-sm font-medium hover:bg-neutral-100"
        >
          Reiniciar
        </button>
      </div>
      <p className="text-sm text-neutral-500">
        Escribí como si fueras un cliente. El bot responde con el catálogo y precios reales y arma el
        pedido como borrador. Es una prueba: <span className="font-medium">no envía nada por WhatsApp</span>.
      </p>

      <div className="flex h-[58vh] flex-col gap-2 overflow-y-auto rounded-xl bg-neutral-50 p-4 ring-1 ring-neutral-200">
        {msgs.length === 0 && (
          <p className="m-auto text-sm text-neutral-400">Escribí "hola" para empezar la conversación.</p>
        )}
        {msgs.map((m, i) => (
          <div
            key={i}
            className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
              m.role === 'user'
                ? 'self-end bg-emerald-600 text-white'
                : 'self-start bg-white text-neutral-800 ring-1 ring-neutral-200'
            }`}
          >
            {m.text}
          </div>
        ))}
        {busy && (
          <div className="self-start rounded-2xl bg-white px-3 py-2 text-sm text-neutral-400 ring-1 ring-neutral-200">
            escribiendo…
          </div>
        )}
      </div>

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void send();
          }}
          placeholder="Escribí un mensaje…"
          className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-neutral-900"
        />
        <button
          onClick={send}
          disabled={busy || !input.trim()}
          className="rounded-lg bg-neutral-900 px-5 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-40"
        >
          Enviar
        </button>
      </div>
    </div>
  );
}
