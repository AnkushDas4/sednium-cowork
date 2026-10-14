import React, { useState, useEffect } from 'react';
import {
  Bot,
  Lock,
  Clock,
  ShieldAlert,
  Cpu,
  FileCode,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import type { ParticipantInfo, FileLockInfo } from '../../api/_types.js';

interface AgentHUDProps {
  participants: Record<string, ParticipantInfo>;
  fileLocks: Record<string, FileLockInfo>;
}

export const AgentHUD: React.FC<AgentHUDProps> = ({ participants, fileLocks }) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const agentKeys = Array.from(
    new Set([
      'loid-ai',
      'peer-ai',
      ...Object.keys(participants).filter((id) => participants[id].role === 'agent'),
    ])
  );

  const getStatus = (lastSeen?: number) => {
    if (!lastSeen) return { label: 'OFFLINE', dot: 'bg-muted', text: 'text-muted' };
    const diff = (now - lastSeen) / 1000;
    if (diff < 30) return { label: 'ONLINE', dot: 'bg-[#FF6B00] animate-pulse', text: 'text-[#FF6B00]' };
    if (diff < 90) return { label: 'IDLE', dot: 'bg-[#FF6B00]/70', text: 'text-primary' };
    return { label: 'DISCONNECTED', dot: 'bg-muted', text: 'text-muted' };
  };

  const getAgentLocks = (agentId: string) => {
    return Object.entries(fileLocks).filter(([_, lock]) => lock.lockedBy === agentId);
  };

  const allLocks = Object.entries(fileLocks);

  return (
    <div className="h-full flex flex-col divide-y divide-grid bg-canvas overflow-y-auto">
      {/* Section 1: Connected Agent Nodes */}
      <div className="p-3.5 space-y-3">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase text-muted tracking-wider">
          <div className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-[#FF6B00]" />
            <span className="font-semibold text-primary">AGENT NODES</span>
          </div>
          <span className="text-[10px]">{agentKeys.length} REGISTERED</span>
        </div>

        <div className="space-y-2.5">
          {agentKeys.map((agentId) => {
            const participant = participants[agentId];
            const status = getStatus(participant?.lastSeen);
            const locks = getAgentLocks(agentId);

            return (
              <div
                key={agentId}
                className="bg-panel border border-grid rounded-sm p-3 space-y-2.5 transition-colors"
              >
                {/* Agent Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 bg-hover border border-grid flex items-center justify-center rounded-sm text-[#FF6B00]">
                      <Bot className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-xs text-primary font-sans leading-tight">
                        @{agentId}
                      </div>
                      <div className="text-[10px] text-muted font-mono leading-none">
                        {participant?.model || 'Autonomous Pair Agent'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-sm bg-hover border border-grid">
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                    <span className={`text-[10px] font-mono font-semibold ${status.text}`}>
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* Status / Task */}
                <div className="bg-canvas border border-grid rounded-sm p-2 text-xs">
                  <div className="text-[10px] font-mono uppercase text-muted mb-0.5">
                    CURRENT TASK
                  </div>
                  <div className="text-secondary text-[11px] font-sans truncate">
                    {participant?.status || 'Awaiting dispatch or pairing instructions...'}
                  </div>
                </div>

                {/* Claimed Files */}
                {locks.length > 0 && (
                  <div className="space-y-1">
                    <div className="text-[10px] font-mono uppercase text-muted flex items-center gap-1">
                      <Lock className="w-2.5 h-2.5 text-[#FF6B00]" />
                      <span>HELD FILE LOCKS ({locks.length})</span>
                    </div>
                    <div className="space-y-1">
                      {locks.map(([file, lock]) => (
                        <div
                          key={file}
                          className="border-l-2 border-[#FF6B00] pl-2 py-0.5 bg-hover/40 text-[11px] font-mono text-primary flex items-center justify-between gap-2"
                        >
                          <span className="truncate">{file}</span>
                          <span className="text-[9px] text-muted shrink-0 font-sans">
                            {lock.task}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Section 2: Active File Lock Registry */}
      <div className="p-3.5 space-y-2.5 flex-1">
        <div className="flex items-center justify-between text-[11px] font-mono uppercase text-muted tracking-wider">
          <div className="flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-[#FF6B00]" />
            <span className="font-semibold text-primary">FILE LOCK REGISTRY</span>
          </div>
          <span className="text-[10px] text-muted">90S TTL</span>
        </div>

        {allLocks.length === 0 ? (
          <div className="bg-panel border border-grid rounded-sm p-4 text-center">
            <FileCode className="w-5 h-5 text-muted mx-auto mb-1.5 opacity-60" />
            <div className="text-xs text-secondary font-medium font-sans">
              No files currently locked
            </div>
            <div className="text-[10px] text-muted font-mono mt-0.5">
              Agents automatically acquire mutex locks on claim
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            {allLocks.map(([filePath, lock]) => {
              const elapsedSeconds = Math.floor((now - lock.timestamp) / 1000);
              const remainingSeconds = Math.max(0, 90 - elapsedSeconds);

              return (
                <div
                  key={filePath}
                  className="bg-panel border border-grid rounded-sm p-2 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 overflow-hidden">
                      <Lock className="w-3 h-3 text-[#FF6B00] shrink-0" />
                      <span className="font-mono text-[11px] text-primary truncate font-medium">
                        {filePath}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] font-mono text-[#FF6B00] bg-hover px-1.5 py-0.5 rounded-sm border border-grid shrink-0">
                      <Clock className="w-2.5 h-2.5" />
                      <span>{remainingSeconds}s</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted font-sans">
                    <span>by @{lock.lockedBy}</span>
                    <span className="truncate italic">"{lock.task}"</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
