import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

const COLORS = {
  '🔴': 'error',
  '🟡': 'warning',
  '🟢': 'success',
  '🔵': 'suggestion',
} as const

type Marker = keyof typeof COLORS
type Section = { body: string; marker: Marker; title: string }

const MARKERS = Object.keys(COLORS)
const HEADING_RULE = [
  'In a reply to the user, group failures, results, skipped checks or risks, and neutral facts.',
  'Start each group with a heading line: 🔴 for failures, 🟢 for results, 🟡 for skipped checks and risks, 🔵 for neutral facts, then a short label, such as "🔴 **Failures**".',
  'Write the content of each group as a short list under its heading line.',
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

const trimBlankLines = (lines: string[]) =>
  lines.join('\n').replace(/^\s*\n/, '').trimEnd()

const cleanTitle = (raw: string) =>
  raw.replace(/\*\*/g, '').replace(/:\s*$/, '').trim()

const parse = (text: string) => {
  const preface: string[] = []
  const sections: { lines: string[]; marker: Marker; title: string }[] = []
  let isInFence = false

  for (const line of text.split('\n')) {
    if (FENCE.test(line)) {
      isInFence = !isInFence
    }

    const heading = isInFence ? null : HEADING.exec(line)
    if (heading) {
      sections.push({
        lines: [],
        marker: heading[1] as Marker,
        title: cleanTitle(heading[2] ?? ""),
      })
      continue
    }

    const current = sections.at(-1)
    if (!current) {
      preface.push(line)
      continue
    }

    current.lines.push(line)
  }

  return {
    preface: trimBlankLines(preface),
    sections: sections.map<Section>(({ lines, marker, title }) => ({
      body: trimBlankLines(lines),
      marker,
      title,
    })),
  }
}

export const register: Register = on => {
  on('prompt.context', async ($, e, next) => {
    const result = await next(e)
    const hasHeadingRule = result.blocks.some(block =>
      MARKERS.every(marker => block.text.includes(marker)),
    )
    if (hasHeadingRule) {
      return result
    }

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
    const isClickable = e.viewport?.isFullscreen === true
    const opened = isClickable ? await read($, openSections) : {}
    const columns = e.viewport?.columns ?? 80
    const prefaceNode = preface
      ? await next({ ...e, props: { ...e.props, text: preface } })
      : null

    return (
      <Box flexDirection="column">
        {prefaceNode}
        {sections.map((section, index) => {
          const key = `${e.requestId}:${index}`
          const color = COLORS[section.marker]
          const lines = section.body ? section.body.split('\n') : []
          const isLong = lines.length > PREVIEW_LINES
          const isOpenByDefault = !(section.marker === '🔵' && isLong)
          const isOpen = opened[key] ?? isOpenByDefault
          const rule = '─'.repeat(Math.max(3, columns - section.title.length - 8))
          const label = [
            <Text color={color}>▌ </Text>,
            <Text bold color={color}>
              {section.title}
            </Text>,
          ]
          const closedLines = isClickable ? 0 : PREVIEW_LINES
          const shownLines = isOpen ? lines.length : closedLines
          const shownBody = lines.slice(0, shownLines).join('\n')
          const hiddenLines = lines.length - shownLines
          const hint = isClickable ? 'click the title' : 'ctrl+o to expand'

          return (
            <Box flexDirection="column" marginTop={index > 0 || prefaceNode ? 1 : 0}>
              <Box>
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
                <Text dimColor> {rule}</Text>
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
        })}
      </Box>
    )
  })
}
