import { atom, read, update } from 'claude-code'
import type { Elements, On, StateDollar } from 'claude-code'

import type { TurnStats } from '../types'
import { column, lined, node, replyLine, track } from './line'
import { parse } from './sections'

type Drawing = Pick<Elements['terminal'], 'Box' | 'Text'>
type CallState = { isErrored: boolean; isInterrupted: boolean; isRunning: boolean }
type Call = CallState & { input: unknown; output?: unknown; tool: string; tool_use_id?: string }

const MAIN_ARGUMENT: Record<string, string> = {
  Agent: 'description',
  Bash: 'command',
  Edit: 'file_path',
  Glob: 'pattern',
  Grep: 'pattern',
  NotebookEdit: 'notebook_path',
  Read: 'file_path',
  WebFetch: 'url',
  Write: 'file_path',
}
const DIFF_TOOLS = new Set(['Edit', 'NotebookEdit', 'Write'])
const SHOWN_DURATION_MS = 1000

const toolDurations = atom(
  { plugin: 'plumage', key: 'toolDurations' } as const,
  {},
  { shape: 'tool-durations-1' },
)

const turnStats = atom(
  { plugin: 'plumage', key: 'turnStats' } as const,
  { endedAt: 0, failed: 0, isComplete: false, tools: 0, worst: 'success' },
  { shape: 'turn-stats-1' },
)

const closedTurns = new Map<string, TurnStats>()

export const callState = (call: CallState) => {
  if (call.isInterrupted) {
    return { color: 'warning', mark: '■', word: 'interrupted' } as const
  }
  if (call.isErrored) {
    return { color: 'error', mark: '✗', word: 'failed' } as const
  }
  if (call.isRunning) {
    return { color: 'suggestion', mark: '…', word: '' } as const
  }

  return { color: 'success', mark: '✓', word: '' } as const
}

export const mainArgument = (tool: string, input: unknown) => {
  const key = MAIN_ARGUMENT[tool]
  if (!key || typeof input !== 'object' || input === null) {
    return ''
  }

  const value = (input as Record<string, unknown>)[key]
  if (typeof value !== 'string') {
    return ''
  }

  const [first = '', ...rest] = value.trim().split('\n')

  return rest.length > 0 ? `${first} …` : first
}

export const errorLine = (output: unknown) =>
  typeof output === 'string' ? (output.split('\n').find(line => line.trim()) ?? '').trim() : ''

export const formatDuration = (durationMs: number) => {
  const seconds = Math.round(durationMs / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const parts = [hours > 0 && `${hours}h`, (hours > 0 || minutes > 0) && `${minutes}m`, `${seconds % 60}s`]

  return parts.filter(Boolean).join(' ')
}

export const formatClock = (epochMs: number) =>
  new Date(epochMs).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

export const turnSummary = (word: string, durationMs: number, stats: TurnStats) =>
  [
    `${word} for ${formatDuration(durationMs)}`,
    stats.tools > 0 && `${stats.tools} ${stats.tools === 1 ? 'tool' : 'tools'}`,
    stats.failed > 0 && `${stats.failed} failed`,
    stats.endedAt > 0 && formatClock(stats.endedAt),
  ]
    .filter(Boolean)
    .join(' · ')

const worstOf = (answer: string, failed: number, isAborted: boolean): TurnStats['worst'] => {
  const markers = new Set(parse(answer).sections.map(section => section.marker))
  if (failed > 0 || markers.has('🔴')) {
    return 'error'
  }
  if (isAborted || markers.has('🟡')) {
    return 'warning'
  }

  return 'success'
}

const callLine = ({ Box, Text }: Drawing, call: Call, durationMs?: number) => {
  const { color, mark, word } = callState(call)
  const argument = mainArgument(call.tool, call.input)
  const error = call.isErrored && !call.isInterrupted ? errorLine(call.output) : ''

  return (
    <Box flexDirection="column">
      <Box>
        <Box flexShrink={0}>
          <Text>
            <Text color={color}>{mark} </Text>
            <Text bold>{call.tool}</Text>
          </Text>
        </Box>
        {argument && (
          <Box flexShrink={1} marginLeft={2}>
            <Text dimColor wrap="truncate-end">
              {argument}
            </Text>
          </Box>
        )}
        {word && (
          <Box flexShrink={0} marginLeft={1}>
            <Text color={color}>{word}</Text>
          </Box>
        )}
        {durationMs !== undefined && durationMs >= SHOWN_DURATION_MS && (
          <Box flexShrink={0} marginLeft={1}>
            <Text dimColor>{formatDuration(durationMs)}</Text>
          </Box>
        )}
      </Box>
      {error && (
        <Box paddingLeft={2}>
          <Text color="error" dimColor wrap="truncate-end">
            {error}
          </Text>
        </Box>
      )}
    </Box>
  )
}

export async function closeTurn($: StateDollar, answer: string, isAborted: boolean, endedAt: number) {
  await update($, turnStats, stats => ({
    ...stats,
    endedAt,
    isComplete: true,
    worst: worstOf(answer, stats.failed, isAborted),
  }))
}

export const registerTimeline = (on: On, { sections }: { sections: boolean }) => {
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await update($, turnStats, () => ({ endedAt: 0, failed: 0, isComplete: false, tools: 0, worst: 'success' }))
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const startedAt = await $.clock.now()
    const result = await next(e)
    const durationMs = (await $.clock.now()) - startedAt
    await update($, turnStats, stats => ({
      ...stats,
      failed: stats.failed + (result.isError === true ? 1 : 0),
      tools: stats.tools + 1,
    }))
    if (durationMs >= SHOWN_DURATION_MS) {
      await update($, toolDurations, all => ({ ...all, [e.tool_use_id]: durationMs }))
    }

    return result
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    if (e.surface !== 'terminal') {
      return next(e)
    }

    const drawing = $.ui.resolve(e)
    if (e.props.origin.kind !== 'composer') {
      return lined(drawing, await next(e))
    }

    const { Box, Text } = drawing

    return (
      <Box marginTop={1}>
        {column(drawing, 1)}
        <Box flexShrink={0} width={2}>
          <Text color="claude">◆</Text>
        </Box>
        <Box flexGrow={1}>
          <Text bold>{e.props.text}</Text>
        </Box>
      </Box>
    )
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded) {
      return next(e)
    }

    const durations = await read($, toolDurations)
    const drawing = $.ui.resolve(e)
    const call = { ...e.props, output: undefined }

    return track(drawing, node(drawing, callLine(drawing, call, durations[e.props.tool_use_id])))
  })

  on('ui.render', { component: 'ToolGroup' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded) {
      return next(e)
    }

    const durations = await read($, toolDurations)
    const drawing = $.ui.resolve(e)
    const rows = e.props.calls.map(call =>
      node(drawing, callLine(drawing, call, call.tool_use_id ? durations[call.tool_use_id] : undefined)),
    )

    return track(drawing, rows)
  })

  on('ui.render', { component: 'ToolResult' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded) {
      return next(e)
    }

    const drawing = $.ui.resolve(e)
    if (DIFF_TOOLS.has(e.props.tool)) {
      return lined(drawing, await next(e))
    }

    const { Box, Text } = drawing
    const error = e.props.isErrored ? errorLine(e.props.output) : ''
    if (!error) {
      return <Box />
    }

    return lined(
      drawing,
      <Box paddingLeft={2}>
        <Text color="error" dimColor wrap="truncate-end">
          {error}
        </Text>
      </Box>,
    )
  })

  on('ui.render', { component: 'CommandOutput' }, async ($, e, next) => {
    if (e.surface !== 'terminal') {
      return next(e)
    }

    return lined($.ui.resolve(e), await next(e))
  })

  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.isExpanded || e.props.waitingFor) {
      return next(e)
    }

    const live = await read($, turnStats)
    const stats = closedTurns.get(e.requestId) ?? live
    if (live.isComplete && !closedTurns.has(e.requestId)) {
      closedTurns.set(e.requestId, live)
    }

    const { Box, Text } = $.ui.resolve(e)

    return (
      <Box flexDirection="column">
        <Text dimColor>│</Text>
        <Text>
          <Text color={stats.worst}>╰─ </Text>
          <Text dimColor>{turnSummary(e.props.word, e.props.durationMs, stats)}</Text>
        </Text>
      </Box>
    )
  })

  if (!sections) {
    on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
      if (e.surface !== 'terminal') {
        return next(e)
      }

      const drawing = $.ui.resolve(e)

      return e.props.isSummary ? lined(drawing, await next(e)) : replyLine(drawing, e.props.text)
    })
  }
}
