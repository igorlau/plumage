import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

import { summarize } from './band'

const REPLY = [
  'Should I also update the docs?',
  '',
  '🔴 **Failures**',
  '- 2 tests failed',
  '- lint failed',
  '',
  '🟢 **Results**',
  '- build passed',
  '',
  '🟡 **Risks**',
  '- the cache is cold',
].join('\n')

const makeSut = (isWorking = false) => ({
  component: 'AbovePrompt' as const,
  plugin: 'plumage',
  props: {
    bodyColumns: 75,
    hasSurvey: false,
    isCollapsed: false,
    isWorking,
    maxRows: 10,
    scroll: { bodyRows: 9, offset: 0 },
    view: {},
  },
  requestId: 'band',
  surface: 'terminal' as const,
  viewport: { columns: 80, isFullscreen: false, rows: 30 },
})

const completeTurn = async ($: Parameters<TestBody>[0], on: Parameters<TestBody>[1], answer: string, agentId?: string) => {
  on('turn.complete', () => ({ text: '' }))
  await $.turn.complete({ agentId, answer, durationMs: 1_000, isAborted: false, reason: 'answer', turnId: 't1' })
}

test('the summary counts the list items of failures and risks and finds a closing question', () => {
  expect(summarize(REPLY)).toEqual({
    groups: [
      { color: 'error', count: 2, title: 'Failures' },
      { color: 'warning', count: 1, title: 'Risks' },
    ],
    hasQuestion: true,
  })
  expect(summarize('Done.\n\n🟢 **Results**\n- ok')).toEqual({ groups: [], hasQuestion: false })
  expect(summarize('**Can I go on?**')).toEqual({ groups: [], hasQuestion: true })
})

test('the band shows the failures, risks, and question of the last reply', async ($, on) => {
  await completeTurn($, on, REPLY)
  const ui = await $.ui.mount(makeSut())

  expect((await ui.find({ type: 'Text', text: /^Failures 2$/ }))?.props.color).toBe('error')
  expect((await ui.find({ type: 'Text', text: /^Risks 1$/ }))?.props.color).toBe('warning')
  expect((await ui.find({ type: 'Text', text: /^Question$/ }))?.props.color).toBe('claude')
  await ui.unmount()
})

test('the band hides while a turn runs, and when the reply has nothing to show', async ($, on) => {
  await completeTurn($, on, REPLY)
  const working = await $.ui.mount(makeSut(true))
  expect(await working.find({ type: 'Text', text: /[✗!?] / })).toBeUndefined()
  await working.unmount()

  await $.turn.complete({ answer: 'Done.', durationMs: 1_000, isAborted: false, reason: 'answer', turnId: 't2' })
  const quiet = await $.ui.mount(makeSut())
  expect(await quiet.find({ type: 'Text', text: /[✗!?] / })).toBeUndefined()
  await quiet.unmount()
})

test('a subagent turn leaves the band alone', async ($, on) => {
  await completeTurn($, on, REPLY, 'agent-1')
  const ui = await $.ui.mount(makeSut())

  expect(await ui.find({ type: 'Text', text: /[✗!?] / })).toBeUndefined()
  await ui.unmount()
})
