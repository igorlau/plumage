import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { errorLine, mainArgument, turnSummary } from './timeline'

type Call = { input: unknown; isErrored: boolean; isInterrupted: boolean; isRunning: boolean; output?: unknown; tool: string; tool_use_id: string }

const VIEWPORT = { columns: 60, isFullscreen: false, rows: 30 }
const BASH: Call = { input: { command: 'npm test' }, isErrored: false, isInterrupted: false, isRunning: false, tool: 'Bash', tool_use_id: 'tool-1' }

const makeSut = <C extends 'ToolGroup' | 'ToolResult' | 'ToolUse' | 'TurnDuration' | 'UserMessage'>(component: C, props: unknown) => ({
  component,
  plugin: 'plumage',
  props: props as never,
  requestId: 'row-1',
  surface: 'terminal' as const,
  viewport: VIEWPORT,
})

const texts = async (ui: { findAll: (q: { type: string }) => Promise<{ text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text' })).map(found => found.text)

test('the helpers pick the main argument, the first error line, and the turn summary', () => {
  expect(mainArgument('Bash', { command: 'cd app\nnpm test' })).toBe('cd app …')
  expect(mainArgument('mcp__x__y', { query: 'q' })).toBe('')
  expect(errorLine('\nExit code 1\nmore')).toBe('Exit code 1')
  expect(errorLine({ stderr: 'x' })).toBe('')
  expect(turnSummary('Baked', 64_000, { endedAt: 0, failed: 1, isComplete: true, tools: 2, worst: 'error' })).toBe(
    'Baked for 1m 4s · 2 tools · 1 failed',
  )
  expect(turnSummary('Baked', 3_000, { endedAt: 0, failed: 0, isComplete: true, tools: 1, worst: 'success' })).toBe(
    'Baked for 3s · 1 tool',
  )
})

test('a typed prompt opens the turn with a diamond, and other messages keep their drawing', async $ => {
  const typed = await $.ui.mount(makeSut('UserMessage', { isExpanded: true, origin: { kind: 'composer' }, text: 'fix the build' }))
  expect((await typed.find({ type: 'Text', text: /^◆$/ }))?.props.color).toBe('claude')
  expect((await typed.find({ type: 'Text', text: /^fix the build$/ }))?.props.bold).toBe(true)
  await typed.unmount()

  const other = await $.ui.mount(makeSut('UserMessage', { isExpanded: true, origin: { kind: 'bridge' }, text: 'hi' }))
  expect(await other.find({ type: 'Text', text: /^◆$/ })).toBeUndefined()
  await other.unmount()
})

test('a tool row shows a mark and a word in the color of its status', async $ => {
  const cases = [
    [{ isRunning: true }, '…', 'suggestion', undefined],
    [{}, '✓', 'success', undefined],
    [{ isErrored: true }, '✗', 'error', 'failed'],
    [{ isErrored: true, isInterrupted: true }, '■', 'warning', 'interrupted'],
  ] as const
  for (const [state, mark, color, word] of cases) {
    const ui = await $.ui.mount(makeSut('ToolUse', { ...BASH, ...state }))

    expect((await ui.find({ type: 'Text', text: new RegExp(`^${mark} $`) }))?.props.color).toBe(color)
    expect(await texts(ui)).toEqual(expect.arrayContaining(['├', 'Bash', 'npm test']))
    expect((await ui.find({ type: 'Text', text: /^(failed|interrupted)$/ }))?.text).toBe(word)
    await ui.unmount()
  }

  const expanded = await $.ui.mount(makeSut('ToolUse', { ...BASH, isExpanded: true }))
  expect(await expanded.find({ type: 'Text', text: /^├$/ })).toBeUndefined()
  await expanded.unmount()
})

test('a tool group draws one node for each call, with the first line of an error', async $ => {
  const calls = [
    { ...BASH, input: { command: 'ls' } },
    { ...BASH, input: { command: 'false' }, isErrored: true, output: 'Exit code 1', tool_use_id: 'tool-2' },
  ]
  const ui = await $.ui.mount(makeSut('ToolGroup', { calls, isActive: false, isExpanded: false }))

  expect(await ui.findAll({ type: 'Text', text: /^├$/ })).toHaveLength(2)
  expect(await texts(ui)).toEqual(expect.arrayContaining(['ls', 'false', 'failed', 'Exit code 1']))
  await ui.unmount()
})

test('a result shows nothing on success, one line on error, and the engine drawing for a diff', async $ => {
  const ok = await $.ui.mount(makeSut('ToolResult', { isErrored: false, output: { stdout: 'a\nb' }, tool: 'Bash', tool_use_id: 't' }))
  expect(await ok.findAll({ type: 'Text' })).toHaveLength(0)
  await ok.unmount()

  const failed = await $.ui.mount(makeSut('ToolResult', { isErrored: true, output: 'Exit code 1\nmore', tool: 'Bash', tool_use_id: 't' }))
  expect((await failed.find({ type: 'Text', text: /^Exit code 1$/ }))?.props.color).toBe('error')
  await failed.unmount()

  const diff = await $.ui.mount(makeSut('ToolResult', { isErrored: false, output: {}, tool: 'Edit', tool_use_id: 't' }))
  expect(await diff.find({ type: 'Text', text: /^Exit code/ })).toBeUndefined()
  expect(await diff.findAll({ type: 'Text' })).not.toHaveLength(0)
  await diff.unmount()
})

const runTurn = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], answer: string) => {
  on('clock.now', () => ({ value: 1_000 }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', ($, e) => ((e as { command?: string }).command === 'false' ? { isError: true, result: null, text: 'Exit code 1' } : { result: null }) as never)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ command: 'ls', tool: 'Bash' } as never)
  await $.tool.call({ command: 'false', tool: 'Bash' } as never)
  await $.turn.complete({ answer, durationMs: 64_000, isAborted: false, reason: 'answer', turnId: 't1' })
}

test('the closing line sums up the turn in the color of its worst status', async ($, on) => {
  await runTurn($, on, 'Done.')
  const ui = await $.ui.mount(makeSut('TurnDuration', { durationMs: 64_000, word: 'Baked' }))

  expect((await ui.find({ type: 'Text', text: /^╰─ $/ }))?.props.color).toBe('error')
  expect(await ui.find({ type: 'Text', text: /^Baked for 1m 4s · 2 tools · 1 failed/ })).toBeDefined()
  await ui.unmount()
})

test('the timeline option turns the line off', { options: { timeline: false } }, async $ => {
  const ui = await $.ui.mount(makeSut('ToolUse', BASH))

  expect(await ui.find({ type: 'Text', text: /^├$/ })).toBeUndefined()
  await ui.unmount()
})
