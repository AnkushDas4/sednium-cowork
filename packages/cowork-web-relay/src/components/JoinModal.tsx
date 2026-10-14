import React, { useState } from 'react';
import { Terminal, Users, Sparkles, ArrowRight } from 'lucide-react';

interface JoinModalProps {
  initialRoom?: string;
  initialClientId?: string;
  onJoin: (roomCode: string, clientId: string) => void;
}

export const JoinModal: React.FC<JoinModalProps> = ({ initialRoom = '', initialClientId = 'loid', onJoin }) => {
  const [room, setRoom] = useState(initialRoom);
  const [clientId, setClientId] = useState(initialClientId);

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'SED-';
    for (let i = 0; i < 3; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
    setRoom(code);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (room.trim() && clientId.trim()) {
      onJoin(room.trim().toUpperCase(), clientId.trim().toLowerCase());
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-cyber-card border border-cyber-border rounded-xl shadow-2xl p-6 relative overflow-hidden">
        {/* Glow accent */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-cyber-emerald via-cyber-cyan to-cyber-violet" />

        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-cyber-emerald">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">SEDNIUM COWORK</h2>
            <p className="text-xs text-cyber-muted font-mono">Stateless Relay & Agent HUD</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">Room Code</label>
              <button
                type="button"
                onClick={generateRoomCode}
                className="text-xs text-cyber-emerald hover:underline flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3" /> Generate New
              </button>
            </div>
            <input
              type="text"
              required
              value={room}
              onChange={(e) => setRoom(e.target.value.toUpperCase())}
              placeholder="e.g. SED-409"
              className="w-full bg-zinc-950 border border-cyber-border rounded-lg px-3.5 py-2.5 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-cyber-emerald transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-zinc-300 uppercase tracking-wider mb-1.5">Your Client Handle</label>
            <div className="flex gap-2 mb-2">
              {['loid', 'peer', 'guest'].map((handle) => (
                <button
                  key={handle}
                  type="button"
                  onClick={() => setClientId(handle)}
                  className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                    clientId === handle
                      ? 'border-cyber-emerald bg-emerald-500/10 text-cyber-emerald'
                      : 'border-zinc-800 bg-zinc-900/50 text-zinc-400 hover:border-zinc-700'
                  }`}
                >
                  @{handle}
                </button>
              ))}
            </div>
            <input
              type="text"
              required
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="e.g. loid"
              className="w-full bg-zinc-950 border border-cyber-border rounded-lg px-3.5 py-2.5 text-sm font-mono text-white placeholder-zinc-600 focus:outline-none focus:border-cyber-emerald transition-colors"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              className="w-full bg-cyber-emerald hover:bg-emerald-400 text-black font-semibold rounded-lg py-2.5 px-4 text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all hover:shadow-emerald-500/30"
            >
              <span>Connect to CoWork Room</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>

        <div className="mt-5 pt-4 border-t border-zinc-800 text-[11px] text-zinc-500 flex items-center justify-between">
          <span>Zero-Auth Relay</span>
          <span>SED-409 Protocol</span>
        </div>
      </div>
    </div>
  );
};
