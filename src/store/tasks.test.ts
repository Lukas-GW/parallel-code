import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IPC } from '../../electron/ipc/channels';

const { mockInvoke, mockIsAgentBracketedPasteEnabled, mockSetStore, mockStore } = vi.hoisted(
  () => ({
    mockInvoke: vi.fn(),
    mockIsAgentBracketedPasteEnabled: vi.fn(),
    mockSetStore: vi.fn(),
    mockStore: {
      agents: {},
      tasks: {},
    } as {
      agents: Record<string, { status: string }>;
      tasks: Record<
        string,
        {
          initialPrompt?: string;
          lastPrompt?: string;
          stepsEnabled?: boolean;
        }
      >;
    },
  }),
);

vi.mock('../lib/ipc', () => ({
  Channel: vi.fn(),
  invoke: mockInvoke,
}));

vi.mock('./core', () => ({
  setStore: mockSetStore,
  store: mockStore,
  cleanupPanelEntries: vi.fn(),
}));

vi.mock('./persistence', () => ({
  saveState: vi.fn(),
}));

vi.mock('./focus', () => ({
  setTaskFocusedPanel: vi.fn(),
}));

vi.mock('./projects', () => ({
  getProject: vi.fn(),
  getProjectBranchPrefix: vi.fn(),
  getProjectPath: vi.fn(),
  isProjectMissing: vi.fn(),
}));

vi.mock('../lib/bookmarks', () => ({
  setPendingShellCommand: vi.fn(),
}));

vi.mock('./taskStatus', () => ({
  clearAgentActivity: vi.fn(),
  clearTaskGitStatusTracking: vi.fn(),
  isAgentBracketedPasteEnabled: mockIsAgentBracketedPasteEnabled,
  isAgentIdle: vi.fn(),
  markAgentBusy: vi.fn(),
  markAgentSpawned: vi.fn(),
  rescheduleTaskStatusPolling: vi.fn(),
}));

vi.mock('./completion', () => ({
  recordMergedLines: vi.fn(),
  recordTaskCompleted: vi.fn(),
}));

vi.mock('../lib/log', () => ({
  warn: vi.fn(),
}));

import { sendPrompt } from './tasks';

function writePayloads(): string[] {
  return mockInvoke.mock.calls
    .filter(([channel]) => channel === IPC.WriteToAgent)
    .map(([, payload]) => payload.data);
}

describe('sendPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvoke.mockResolvedValue(undefined);
    mockIsAgentBracketedPasteEnabled.mockReturnValue(false);
    mockStore.agents = { 'agent-1': { status: 'running' } };
    mockStore.tasks = {
      'task-1': {
        lastPrompt: '',
      },
    };
  });

  it('wraps prompt text in bracketed paste when the agent enabled it', async () => {
    mockIsAgentBracketedPasteEnabled.mockReturnValue(true);

    await sendPrompt('task-1', 'agent-1', 'hello Codex');

    expect(writePayloads()).toEqual(['\x1b[I', '\x1b[200~hello Codex\x1b[201~', '\r']);
    expect(mockSetStore).toHaveBeenCalledWith('tasks', 'task-1', 'lastPrompt', 'hello Codex');
  });

  it('sends raw prompt text when bracketed paste is not enabled', async () => {
    await sendPrompt('task-1', 'agent-1', 'hello Codex');

    expect(writePayloads()).toEqual(['\x1b[I', 'hello Codex', '\r']);
  });

  it('keeps Enter outside the bracketed paste block', async () => {
    mockIsAgentBracketedPasteEnabled.mockReturnValue(true);

    await sendPrompt('task-1', 'agent-1', 'line 1\nline 2');

    expect(writePayloads()).toEqual(['\x1b[I', '\x1b[200~line 1\nline 2\x1b[201~', '\r']);
  });
});
