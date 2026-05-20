import React, { useState } from 'react';
import { Webhook, Plus, Send, CheckCircle2 } from 'lucide-react';
import { User } from 'firebase/auth';

export function AgentWebhooks({ user }: { user: User }) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState(['llc.approved']);
  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await fetch('/api/webhooks/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, events }),
      });
      setStatus('Subscription Active');
      setUrl('');
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      <header>
        <h2 className="text-4xl font-bold tracking-tight uppercase mb-2">Agent Webhooks</h2>
        <p className="text-[#141414]/60 font-mono text-sm uppercase italic">Subscribe external systems to corporate events (Statute 8 partial)</p>
      </header>

      <div className="border border-[#141414] bg-white p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-[10px] font-mono uppercase opacity-50 mb-1">Webhook Endpoint URL</label>
            <input
              required
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              className="w-full border-b border-[#141414] py-2 focus:outline-none focus:border-b-2 font-medium"
              placeholder="https://api.youragent.com/webhooks/prospera"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase opacity-50 mb-3">Subscribed Events</label>
            <div className="flex flex-wrap gap-3">
              {['residency.approved', 'llc.approved'].map(event => (
                <label key={event} className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={events.includes(event)}
                    onChange={() => {
                      if (events.includes(event)) setEvents(events.filter(e => e !== event));
                      else setEvents([...events, event]);
                    }}
                    className="hidden"
                  />
                  <div className={`
                    px-3 py-1.5 border border-[#141414] text-[10px] font-bold uppercase transition-all
                    ${events.includes(event) ? 'bg-[#141414] text-[#E4E3E0]' : 'bg-transparent text-[#141414] group-hover:bg-[#141414]/5'}
                  `}>
                    {event}
                  </div>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-[#141414] text-[#E4E3E0] py-4 uppercase font-bold tracking-widest flex items-center justify-center gap-2 hover:bg-black transition-colors"
          >
            <Plus size={18} /> Update Subscription
          </button>
        </form>

        {status && (
          <div className="mt-6 flex items-center justify-center gap-2 text-green-600 font-bold uppercase text-xs">
            <CheckCircle2 size={16} />
            <span>{status}</span>
          </div>
        )}
      </div>

      <div className="border border-[#141414] bg-[#141414]/5 p-6 space-y-4">
        <h3 className="text-xs font-bold uppercase flex items-center gap-2">
          <Send size={14} /> Documentation: Webhook Payload Format
        </h3>
        <pre className="text-[10px] font-mono bg-[#141414] text-[#E4E3E0] p-4 overflow-auto">
{`{
  "event_type": "llc.approved",
  "entity_id": "uuid",
  "company_name": "...",
  "timestamp": "2026-05-17T22:54:49Z"
}`}
        </pre>
      </div>
    </div>
  );
}
