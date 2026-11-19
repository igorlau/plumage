import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

const REPLY = [
  'Done.',
  '',
  '🔴 **Failures**',
  '- npm test failed in 2 cases',
  '',
  '🔵 **Facts**',
  ...Array.from({ length: 10 }, (_, n) => `- fact ${n + 1}`),
].join('\n')

const makeSut = (text: string, isFullscreen: boolean) => ({
  component: 'AssistantMessage' as const,
  plugin: 'plumage',
  props: { isFirstOfReply: true, text },
  requestId: 'msg-1',
  viewport: { columns: 60, isFullscreen, rows: 30 },
})

const answerSessionInfo = (on: Parameters<TestBody>[1]) =>
  on('session.info', () => ({
    value: {
      machine: 'x86_64',
      packageManagers: [],
      platform: 'linux',
      release: '',
      runtimes: [],
      sysname: 'Linux',
      transcriptPath: '',
    },
  }))

const markdownTexts = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Markdown' })).map(found => found.props.text)

test('the main screen draws colored titles and cuts a long info section', async ($, on) => {
  answerSessionInfo(on)
  const ui = await $.ui.mount({ ...makeSut(REPLY, false), surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /^Failures$/ }))?.props.color).toBe('error')
  expect((await ui.find({ type: 'Text', text: /^Facts$/ }))?.props.color).toBe('suggestion')
  expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
  expect(await markdownTexts(ui)).toContain('- npm test failed in 2 cases')
  expect(await markdownTexts(ui)).toContain(
    Array.from({ length: 6 }, (_, n) => `- fact ${n + 1}`).join('\n'),
  )
  expect(await ui.find({ type: 'Text', text: /\+4 lines \(ctrl\+o to expand\)/ })).toBeDefined()
  await ui.unmount()
})

test('the desktop draws every section open, with no button', async ($, on) => {
  answerSessionInfo(on)
  for (const isFullscreen of [false, true]) {
    const ui = await $.ui.mount({ ...makeSut(REPLY, isFullscreen), surface: 'desktop' })

    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    expect((await markdownTexts(ui)).some(text => String(text).includes('- fact 10'))).toBe(true)
    expect(await ui.find({ type: 'Text', text: /\+\d+ lines/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('fullscreen opens and closes a section with a click on its title', async ($, on) => {
  answerSessionInfo(on)
  const ui = await $.ui.mount({ ...makeSut(REPLY, true), surface: 'terminal' })

  expect(await ui.find({ type: 'Text', text: /\+10 lines \(click the title\)/ })).toBeDefined()

  await ui.press({ key: 'msg-1:suggestion' })
  expect(await ui.find({ type: 'Text', text: /click the title/ })).toBeUndefined()
  expect((await markdownTexts(ui)).some(text => String(text).includes('- fact 10'))).toBe(true)

  await ui.press({ key: 'msg-1:error' })
  expect(await markdownTexts(ui)).not.toContain('- npm test failed in 2 cases')
  expect(await ui.find({ type: 'Text', text: /\+1 lines/ })).toBeDefined()
  await ui.unmount()
})

test('the context always gets the heading rule', async ($, on) => {
  const blocks = [{ name: 'claudeMd', text: 'Group under 🔴, 🟢, 🟡, or 🔵 headings.' }]
  on('prompt.context', () => ({ blocks }))

  const result = await $.prompt.context({ blocks })

  expect(result.blocks.map(block => block.name)).toEqual(['claudeMd', 'severitySections'])
  expect(result.blocks[1]?.text).toMatch(/questions to the user as plain text before the groups/)
})

test('the sections option turns off the rule and the drawing', { options: { sections: false, timeline: false } }, async ($, on) => {
  on('prompt.context', () => ({ blocks: [] }))

  expect((await $.prompt.context({ blocks: [] })).blocks).toEqual([])

  const ui = await $.ui.mount({ ...makeSut(REPLY, false), surface: 'terminal' })
  expect(await ui.findAll({ type: 'Markdown' })).toHaveLength(0)
  await ui.unmount()
})

test('two groups of one kind draw as one section', async ($, on) => {
  answerSessionInfo(on)
  const text = ['🔴 **Test failures**', '- 2 tests failed', '', '🔴 **Lint failures**', '- 3 lint errors'].join('\n')
  const ui = await $.ui.mount({ ...makeSut(text, false), surface: 'terminal' })

  expect(await ui.findAll({ type: 'Text', text: /^Test failures$/ })).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /^Lint failures$/ })).toBeUndefined()
  expect(await markdownTexts(ui)).toEqual(['- 2 tests failed\n\n**Lint failures**\n- 3 lint errors'])
  await ui.unmount()
})

test('sections draw in the order failures, results, risks, facts', async ($, on) => {
  answerSessionInfo(on)
  const text = ['🔵 **Facts**', '- a', '🟡 **Risks**', '- b', '🟢 **Results**', '- c', '🔴 **Failures**', '- d'].join('\n')
  const ui = await $.ui.mount({ ...makeSut(text, false), surface: 'terminal' })

  const titles = await ui.findAll({ type: 'Text', text: /^(Facts|Risks|Results|Failures)$/ })
  expect(titles.map(found => found.text)).toEqual(['Failures', 'Results', 'Risks', 'Facts'])
  await ui.unmount()
})

test('the cut of a long section never leaves a code block open', async ($, on) => {
  answerSessionInfo(on)
  const text = ['🔵 **Facts**', '- a', '- b', '- c', '- d', '```', 'one', 'two', 'three', '```'].join('\n')
  const ui = await $.ui.mount({ ...makeSut(text, false), surface: 'terminal' })

  expect(await markdownTexts(ui)).toEqual(['- a\n- b\n- c\n- d'])
  expect(await ui.find({ type: 'Text', text: /\+5 lines/ })).toBeDefined()
  await ui.unmount()
})

test('without the timeline, the terminal draws the reply bullet when the reply opens with a section', { options: { timeline: false } }, async ($, on) => {
  answerSessionInfo(on)
  for (const [text, bullets] of [['🔴 **Failures**\n- a', 1], ['Done.\n\n🔴 **Failures**\n- a', 0]] as const) {
    const ui = await $.ui.mount({ ...makeSut(text, false), surface: 'terminal' })

    expect(await ui.findAll({ type: 'Text', text: /^[⏺●]$/ })).toHaveLength(bullets)
    await ui.unmount()
  }
})

test('without the timeline, a reply without markers keeps the engine drawing', { options: { timeline: false } }, async $ => {
  for (const text of ['plain reply', '```\n🔴 not a heading\n```']) {
    const ui = await $.ui.mount({ ...makeSut(text, false), surface: 'terminal' })

    expect(await ui.findAll({ type: 'Markdown' })).toHaveLength(0)
    expect(await ui.find({ type: 'Text', text: /▌/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('the timeline draws each section as a node with a glyph and no rule', async ($, on) => {
  answerSessionInfo(on)
  const ui = await $.ui.mount({ ...makeSut(REPLY, false), surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /^✗ $/ }))?.props.color).toBe('error')
  expect((await ui.find({ type: 'Text', text: /^• $/ }))?.props.color).toBe('suggestion')
  expect(await ui.findAll({ type: 'Text', text: /^├$/ })).toHaveLength(3)
  expect(await ui.find({ type: 'Text', text: /^─+$/ })).toBeUndefined()
  expect(await markdownTexts(ui)).toContain('Done.')
  await ui.unmount()
})
