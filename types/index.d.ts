export type OpenSections = Record<string, boolean>

export type LastReply = {
  groups: { color: 'error' | 'warning'; count: number; title: string }[]
  hasQuestion: boolean
}

export type ToolDurations = Record<string, number>

export type TurnStats = {
  endedAt: number
  failed: number
  isComplete: boolean
  tools: number
  worst: 'error' | 'success' | 'warning'
}

declare module 'claude-code' {
  interface PluginState {
    'plumage': {
      lastReply: Shaped<LastReply>
      openSections: Shaped<OpenSections>
      toolDurations: Shaped<ToolDurations>
      turnStats: Shaped<TurnStats>
    }
  }
}
