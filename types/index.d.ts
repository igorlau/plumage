export type OpenSections = Record<string, boolean>

declare module 'claude-code' {
  interface PluginState {
    'plumage': { openSections: Shaped<OpenSections> }
  }
}
