import React, { useState, useEffect } from 'react';
import {
  Bot,
  Lock,
  Clock,
  ShieldAlert,
  Cpu,
  FileCode,
} from 'lucide-react';
import type { ParticipantInfo, FileLockInfo } from '../../api/_types.js';

interface AgentHUDProps {
  participants: Record<string, ParticipantInfo>;
  fileLocks: Record<string, FileLockInfo>;
  roomCode?: string;
}

export const AgentHUD: React.FC<AgentHUDProps> = ({
  participants,
  fileLocks,
}) => {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Dynamically find all connected agents from live participants (zero hardcoded names)
  const connectedAgentEntries = Object.entries(participants).filter(
    ([_, p]) => p.role === 'agent'
  );

  const getStatus = (lastSeen?: number) => {
    if (!lastSeen) return { label: 'OFFLINE', dot: 'bg-muted', text: 'text-muted' };
    const diff = (now - lastSeen) / 1000;
    if (diff < 30) return { label: 'ONLINE', dot: 'bg-[#10B981] animate-pulse', text: 'text-[#10B981]' };
    if (diff < 90) return { label: 'IDLE', dot: 'bg-accent', text: 'text-accent' };
    return { label: 'DISCONNECTED', dot: 'bg-muted', text: 'text-muted' };
  };

  const getAgentLocks = (agentId: string) => {
    return Object.entries(fileLocks).filter(([_, lock]) => lock.lockedBy === agentId);
  };

  const allLocks = Object.entries(fileLocks);

  return (
    <div className="h-full flex flex-col divide-y divide-grid bg-canvas overflow-y-auto scroll-panel">
      {/* 1. Header Bar for Agent Section */}
      <div className="px-4 xs:px-5 py-3.5 bg-panel flex items-center justify-between text-xs font-mono uppercase text-muted tracking-wider shrink-0">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-accent" />
          <span className="font-semibold text-primary text-xs">AGENT NODES</span>
        </div>
        <span className="text-[11px] font-semibold text-secondary">
          {connectedAgentEntries.length === 0
            ? '0 ACTIVE AGENTS'
            : `${connectedAgentEntries.filter(([, p]) => now - p.lastSeen < 90000).length} ACTIVE AGENT${
                connectedAgentEntries.filter(([, p]) => now - p.lastSeen < 90000).length > 1 ? 'S' : ''
              }`}
        </span>
      </div>

      {/* 2. Flush Agent Cards / 0-State */}
      <div className="divide-y divide-grid bg-canvas">
        {connectedAgentEntries.length === 0 ? (
          /* Pure Dynamic 0-Agent Empty State (No hardcoded ghost slots) */
          <div className="px-5 py-12 text-center text-muted space-y-2.5">
            <div className="w-10 h-10 rounded-sm bg-panel border border-grid flex items-center justify-center mx-auto text-muted">
              <Bot className="w-5 h-5 opacity-40" />
            </div>
            <div className="text-xs font-sans font-semibold text-primary">
              No Agents Connected
            </div>
            <p className="text-[11px] font-sans text-secondary max-w-xs mx-auto leading-relaxed">
              Connect your Antigravity AI using the prompt generator in the center canvas to bind an agent to this room.
            </p>
          </div>
        ) : (
          /* Render Exclusively Connected Agents with whatever custom agentId was given */
          connectedAgentEntries.map(([agentId, participant]) => {
            const status = getStatus(participant?.lastSeen);
            const locks = getAgentLocks(agentId);

            return (
              <div key={agentId} className="px-4 xs:px-5 py-3.5 space-y-2.5 bg-canvas transition-colors">
                {/* Agent Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 bg-hover border border-grid flex items-center justify-center rounded-sm text-accent">
                      <Bot className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-[15px] text-primary font-sans leading-tight">
                        @{agentId}
                      </div>
                      <div className="text-[11px] text-secondary font-mono leading-none">
                        {participant.model || 'Autonomous Pair Agent'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-sm bg-panel border border-grid">
                    <span className={`w-2 h-2 rounded-full ${status.dot}`} />
                    <span className={`text-[11px] font-mono font-semibold ${status.text}`}>
                      {status.label}
                    </span>
                  </div>
                </div>

                {/* Clean Unbordered Current Task Line */}
                <div className="pt-1">
                  <div className="text-2xs font-mono uppercase text-muted tracking-wide mb-0.5">
                    CURRENT TASK
                  </div>
                  <div className="text-[13px] text-primary font-sans font-medium leading-relaxed">
                    {participant.status || 'Active & listening on relay...'}
                  </div>
                </div>

                {/* Claimed Files List */}
                {locks.length > 0 && (
                  <div className="space-y-1.5 pt-1">
                    <div className="text-2xs font-mono uppercase text-muted flex items-center gap-1">
                      <Lock className="w-3 h-3 text-accent" />
                      <span>CLAIMED FILES ({locks.length})</span>
                    </div>
                    <div className="space-y-1">
                      {locks.map(([file, lock]) => (
                        <div
                          key={file}
                          className="border-l-2 border-accent pl-2.5 py-1 bg-panel text-xs font-mono text-primary flex items-center justify-between gap-2"
                        >
                          <span className="truncate font-semibold">{file}</span>
                          <span className="text-2xs text-secondary shrink-0 font-sans">
                            {lock.task}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* 3. Section Header for File Locks */}
      <div className="px-5 py-3.5 bg-panel flex items-center justify-between text-xs font-mono uppercase text-muted tracking-wider shrink-0">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-accent" />
          <span className="font-semibold text-primary text-xs">FILE LOCK REGISTRY</span>
        </div>
        <span className="text-[11px] font-mono text-muted">90S TTL</span>
      </div>

      {/* 4. Flush File Locks List */}
      <div className="flex-1 divide-y divide-grid bg-canvas">
        {allLocks.length === 0 ? (
          <div className="px-5 py-8 text-center text-muted space-y-1.5">
            <FileCode className="w-6 h-6 text-muted mx-auto opacity-40" />
            <div className="text-xs text-secondary font-medium font-sans">
              No files currently locked
            </div>
            <div className="text-[11px] text-muted font-mono">
              Auto-acquired when AI edits files via cowork_claim_files
            </div>
          </div>
        ) : (
          allLocks.map(([filePath, lock]) => {
            const elapsedSeconds = Math.floor((now - lock.timestamp) / 1000);
            const remainingSeconds = Math.max(0, 90 - elapsedSeconds);

            return (
              <div key={filePath} className="px-5 py-3 text-xs space-y-1 bg-canvas">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 overflow-hidden">
                    <Lock className="w-3.5 h-3.5 text-accent shrink-0" />
                    <span className="font-mono text-xs text-primary truncate font-semibold">
                      {filePath}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-mono text-accent bg-panel px-2 py-0.5 rounded-sm border border-grid shrink-0">
                    <Clock className="w-3 h-3" />
                    <span className="font-semibold">{remainingSeconds}s</span>
                  </div>
                </div>
                <div className="flex items-center justify-between text-[11px] text-secondary font-sans">
                  <span>Locked by @{lock.lockedBy}</span>
                  <span className="truncate italic">"{lock.task}"</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
