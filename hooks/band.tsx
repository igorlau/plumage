import { atom, read, update } from 'claude-code'
import type { On, StateDollar } from 'claude-code'

import type { LastReply } from '../types'
import { COLORS, parse } from './sections'

const LIST_ITEM = /^(?:[-*+]|\d+[.)])\s/
const ENDS_WITH_QUESTION = /\?[*_)\s]*$/
const GLYPHS = { error: '✗', warning: '!' } as const

const lastReply = atom(
  { plugin: 'plumage', key: 'lastReply' } as const,
  { groups: [], hasQuestion: false },
  { shape: 'last-reply-1' },
)

export const summarize = (answer: string): LastReply => {
  const { preface, sections } = parse(answer)

  return {
    groups: sections.flatMap(section => {
      const color = COLORS[section.marker]
      if (color !== 'error' && color !== 'warning') {
        return []
      }

      const count = section.body.split('\n').filter(line => LIST_ITEM.test(line)).length

      return [{ color, count, title: section.title }]
    }),
    hasQuestion: ENDS_WITH_QUESTION.test(preface),
  }
}

export async function recordReply($: StateDollar, answer: string) {
  await update($, lastReply, () => summarize(answer))
}

export const registerBand = (on: On) => {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'terminal' || e.props.hasSurvey || e.props.isWorking) {
      return next(e)
    }

    const reply = await read($, lastReply)
    if (reply.groups.length === 0 && !reply.hasQuestion) {
      return next(e)
    }

    const { Box, Text } = $.ui.resolve(e)
    const labels = [
      ...reply.groups.map(group => ({
        color: group.color,
        glyph: GLYPHS[group.color],
        label: group.count > 0 ? `${group.title} ${group.count}` : group.title,
      })),
      ...(reply.hasQuestion ? [{ color: 'claude', glyph: '?', label: 'Question' }] : []),
    ]

    return (
      <Box>
        <Text wrap="truncate-end">
          {labels.flatMap(({ color, glyph, label }, index) => [
            index > 0 ? '  ' : '',
            <Text color={color}>{glyph} </Text>,
            <Text bold color={color}>
              {label}
            </Text>,
          ])}
        </Text>
      </Box>
    )
  })
}
