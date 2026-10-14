import React from 'react';
import { Bot, Lock, CheckCircle2, AlertCircle, Clock, Sparkles } from 'lucide-react';
import type { ParticipantInfo, FileLockInfo } from '../../api/_types.js';

interface AgentHUDProps {
  participants: Record<string, ParticipantInfo>;
  fileLocks: Record<string, FileLockInfo>;
}

export const AgentHUD: React.FC<AgentHUDProps> = ({ participants, fileLocks }) => {
  // Ensure we display cards for loid-ai and peer-ai, plus any other discovered agents
  const agentKeys = Array.from(
    new Set(['loid-ai', 'peer-ai', ...Object.keys(participants).filter((id) => participants[id].role === 'agent')])
  );

  const getStatusHealth = (lastSeen?: number) => {
    if (!lastSeen) return { status: 'OFFLINE', color: 'bg-zinc-600', text: 'text-zinc-500' };
    const diff = (Date.now() - lastSeen) / 1000;
    if (diff < 30) return { status: 'ACTIVE', color: 'bg-cyber-emerald animate-glow', text: 'text-cyber-emerald' };
    if (diff < 90) return { status: 'IDLE', color: 'bg-cyber-amber', text: 'text-cyber-amber' };
    return { status: 'DISCONNECTED', color: 'bg-zinc-600', text: 'text-zinc-500' };
  };

  const getAgentLocks = (agentId: string) => {
    return Object.entries(fileLocks).filter(([_, lock]) => lock.lockedBy === agentId);
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {agentKeys.map((agentId) => {
        const participant = participants[agentId];
        const health = getStatusHealth(participant?.lastSeen);
        const locks = getAgentLocks(agentId);
        const isLoid = agentId === 'loid-ai';

        return (
          <div
            key={agentId}
            className={`bg-cyber-card border rounded-xl p-4 transition-all relative overflow-hidden ${
              health.status === 'ACTIVE'
                ? isLoid
                  ? 'border-emerald-500/40 shadow-lg shadow-emerald-950/20'
                  : 'border-cyan-500/40 shadow-lg shadow-cyan-950/20'
                : 'border-cyber-border'
            }`}
          >
            {/* Top Bar of Card */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    isLoid ? 'bg-emerald-500/10 text-cyber-emerald' : 'bg-cyan-500/10 text-cyber-cyan'
                  } border border-white/5`}
                >
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-white">@{agentId}</span>
                    <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-zinc-400">
                      {participant?.harness || (isLoid ? 'Antigravity' : 'MCP Agent')}
                    </span>
                  </div>
                  {participant?.model && (
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-300 flex items-center gap-1">
                        <Sparkles className="w-2.5 h-2.5 text-indigo-400" />
                        {participant.model}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className={`w-2 h-2 rounded-full ${health.color}`} />
                    <span className={`text-[11px] font-semibold tracking-wider ${health.text}`}>
                      {health.status}
                    </span>
                    {participant?.lastSeen && (
                      <span className="text-[10px] text-zinc-500">
                        • {Math.floor((Date.now() - participant.lastSeen) / 1000)}s ago
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Status pill */}
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-wider text-zinc-500">Current Task</div>
                <div className="text-xs text-zinc-200 font-mono truncate max-w-[150px]">
                  {participant?.status || 'Idle / Listening'}
                </div>
              </div>
            </div>

            {/* Locked Files Section */}
            <div className="mt-3 pt-3 border-t border-zinc-800/80">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-zinc-400 flex items-center gap-1.5 font-medium">
                  <Lock className="w-3.5 h-3.5 text-cyber-amber" /> Locked Files ({locks.length})
                </span>
                {locks.length > 0 && (
                  <span className="text-[10px] text-cyber-amber font-mono bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20">
                    TTL 90s
                  </span>
                )}
              </div>

              {locks.length === 0 ? (
                <div className="text-xs text-zinc-600 italic py-1 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-zinc-700" />
                  <span>No active file locks held</span>
                </div>
              ) : (
                <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                  {locks.map(([file, lock]) => (
                    <div
                      key={file}
                      className="flex items-center justify-between bg-zinc-950/80 border border-amber-500/20 rounded px-2.5 py-1.5 text-xs font-mono"
                    >
                      <span className="text-amber-400 font-medium truncate max-w-[200px]" title={file}>
                        {file}
                      </span>
                      <span className="text-[10px] text-zinc-500 truncate max-w-[120px]" title={lock.task}>
                        {lock.task}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
