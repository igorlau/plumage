import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const COLORS = {
  '🔴': 'error',
  '🟢': 'success',
  '🟡': 'warning',
  '🔵': 'suggestion',
} as const

type Marker = keyof typeof COLORS
type Section = { body: string; marker: Marker; title: string }

const ORDER = Object.keys(COLORS) as Marker[]

const HEADING_RULE = [
  'In a reply to the user, group failures, results, skipped checks or risks, and neutral facts.',
  'Start each group with a heading line: 🔴 for failures, 🟢 for results, 🟡 for skipped checks and risks, 🔵 for neutral facts, then a short label, such as "🔴 **Failures**".',
  'Write the content of each group as a short list under its heading line.',
  'Write at most one group of each kind, and put the groups at the end of the reply.',
  'Put the groups in that order, with a blank line between them. Leave out a group that has no content.',
  'The terminal draws each group as a colored section.',
].join('\n')

const PREVIEW_LINES = 6
const HEADING = /^\s*(?:#{1,6}\s+)?(?:\*\*)?\s*(🔴|🟡|🟢|🔵)(.*)$/u
const FENCE = /^\s*(?:```|~~~)/

// shortcut: one value for every message, so a toggle redraws all section messages; use a StateFamily per message if redraws lag.
const openSections = atom(
  { plugin: 'plumage', key: 'openSections' } as const,
  {},
  { shape: 'open-sections-1' },
)

const previewLength = (lines: string[]) => {
  let openFence = -1
  for (const [index, line] of lines.slice(0, PREVIEW_LINES).entries()) {
    if (FENCE.test(line)) {
      openFence = openFence === -1 ? index : -1
    }
  }

  return openFence === -1 ? PREVIEW_LINES : openFence
}

const trimBlankLines = (lines: string[]) =>
  lines.join('\n').replace(/^\s*\n/, '').trimEnd()

const cleanTitle = (raw: string) =>
  raw.replace(/\*\*/g, '').replace(/:\s*$/, '').trim()

const parse = (text: string) => {
  const preface: string[] = []
  const groups = new Map<Marker, { lines: string[]; title: string }>()
  let current = preface
  let isInFence = false

  for (const line of text.split('\n')) {
    if (FENCE.test(line)) {
      isInFence = !isInFence
    }

    const heading = isInFence ? null : HEADING.exec(line)
    if (!heading) {
      current.push(line)
      continue
    }

    const marker = heading[1] as Marker
    const title = cleanTitle(heading[2] ?? '')
    const group = groups.get(marker)
    if (!group) {
      const created = { lines: [] as string[], title }
      groups.set(marker, created)
      current = created.lines
      continue
    }

    while (group.lines.at(-1)?.trim() === '') {
      group.lines.pop()
    }
    group.lines.push('', ...(title ? [`**${title}**`] : []))
    current = group.lines
  }

  return {
    preface: trimBlankLines(preface),
    sections: ORDER.flatMap<Section>(marker => {
      const group = groups.get(marker)
      if (!group) {
        return []
      }

      return [{ body: trimBlankLines(group.lines), marker, title: group.title }]
    }),
  }
}

export const register: Register = on => {
  on('prompt.context', async ($, e, next) => {
    const result = await next(e)

    return {
      ...result,
      blocks: [...result.blocks, { name: 'severitySections', text: HEADING_RULE }],
    }
  })

  on('ui.render', { component: 'AssistantMessage' }, async ($, e, next) => {
    if (e.props.isSummary) {
      return next(e)
    }

    const { preface, sections } = parse(e.props.text)
    if (sections.length === 0) {
      return next(e)
    }

    const { Box, Button, Markdown, Text } = $.ui.resolve(e)
    const isTerminal = e.surface === 'terminal'
    const isClickable = isTerminal && e.viewport?.isFullscreen === true
    const opened = isClickable ? await read($, openSections) : {}
    const columns = e.viewport?.columns ?? 80
    const prefaceNode = preface
      ? await next({ ...e, props: { ...e.props, text: preface } })
      : null

    const sectionNodes = sections.map((section, index) => {
      const color = COLORS[section.marker]
      const key = `${e.requestId}:${color}`
      const lines = section.body ? section.body.split('\n') : []
      const isLong = lines.length > PREVIEW_LINES
      const isOpenByDefault = !(isTerminal && section.marker === '🔵' && isLong)
      const isOpen = opened[key] ?? isOpenByDefault
      const label = [
        <Text color={color}>▌ </Text>,
        <Text bold color={color}>
          {section.title}
        </Text>,
      ]
      const closedLines = isClickable ? 0 : previewLength(lines)
      const shownLines = isOpen ? lines.length : closedLines
      const shownBody = lines.slice(0, shownLines).join('\n')
      const hiddenLines = lines.length - shownLines
      const hint = isClickable ? 'click the title' : 'ctrl+o to expand'

      return (
        <Box flexDirection="column" marginTop={index > 0 ? 1 : 0}>
          <Box>
            <Box flexShrink={0}>
              {isClickable ? (
                <Button
                  key={key}
                  plain
                  onPress={() =>
                    update($, openSections, all => ({
                      ...all,
                      [key]: !(all[key] ?? isOpenByDefault),
                    }))
                  }
                >
                  {label}
                </Button>
              ) : (
                <Text>{label}</Text>
              )}
            </Box>
            <Box flexGrow={1} height={1} marginLeft={1} overflow="hidden">
              <Text dimColor>{'─'.repeat(columns)}</Text>
            </Box>
          </Box>
          {shownBody && (
            <Box paddingLeft={2}>
              <Markdown text={shownBody} />
            </Box>
          )}
          {hiddenLines > 0 && (
            <Box paddingLeft={2}>
              <Text dimColor>
                … +{hiddenLines} lines ({hint})
              </Text>
            </Box>
          )}
        </Box>
      )
    })
    const sectionList = (
      <Box flexDirection="column" flexGrow={1} marginTop={prefaceNode ? 1 : 0}>
        {sectionNodes}
      </Box>
    )
    if (!isTerminal) {
      return (
        <Box flexDirection="column">
          {prefaceNode}
          {sectionList}
        </Box>
      )
    }

    const hasBullet = e.props.isFirstOfReply && !prefaceNode
    const platform = hasBullet ? (await $.session.info()).platform : undefined
    const bullet = platform === 'macos' ? '⏺' : '●'

    return (
      <Box flexDirection="column">
        {prefaceNode}
        <Box>
          <Box flexShrink={0} width={2}>
            <Text>{hasBullet ? bullet : ' '}</Text>
          </Box>
          {sectionList}
        </Box>
      </Box>
    )
  })
}
