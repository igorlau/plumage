import { expect, test } from 'claude-code/testing'

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

const markdownTexts = async (ui: { findAll: (q: { type: string }) => Promise<{ props: Record<string, unknown> }[]> }) =>
  (await ui.findAll({ type: 'Markdown' })).map(found => found.props.text)

test('the main screen draws colored titles and cuts a long info section', async $ => {
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...makeSut(REPLY, false), surface })

    expect((await ui.find({ type: 'Text', text: /^Failures$/ }))?.props.color).toBe('error')
    expect((await ui.find({ type: 'Text', text: /^Facts$/ }))?.props.color).toBe('suggestion')
    expect(await ui.findAll({ type: 'Button' })).toHaveLength(0)
    expect(await markdownTexts(ui)).toContain('- npm test failed in 2 cases')
    expect(await markdownTexts(ui)).toContain(
      Array.from({ length: 6 }, (_, n) => `- fact ${n + 1}`).join('\n'),
    )
    expect(await ui.find({ type: 'Text', text: /\+4 lines \(ctrl\+o to expand\)/ })).toBeDefined()
    await ui.unmount()
  }
})

test('fullscreen opens and closes a section with a click on its title', async $ => {
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
})

test('two groups of one kind draw as one section', async $ => {
  const text = ['🔴 **Test failures**', '- 2 tests failed', '', '🔴 **Lint failures**', '- 3 lint errors'].join('\n')
  const ui = await $.ui.mount({ ...makeSut(text, false), surface: 'terminal' })

  expect(await ui.findAll({ type: 'Text', text: /^Test failures$/ })).toHaveLength(1)
  expect(await ui.find({ type: 'Text', text: /^Lint failures$/ })).toBeUndefined()
  expect(await markdownTexts(ui)).toEqual(['- 2 tests failed\n\n**Lint failures**\n- 3 lint errors'])
  await ui.unmount()
})

test('sections draw in the order failures, results, risks, facts', async $ => {
  const text = ['🔵 **Facts**', '- a', '🟡 **Risks**', '- b', '🟢 **Results**', '- c', '🔴 **Failures**', '- d'].join('\n')
  const ui = await $.ui.mount({ ...makeSut(text, false), surface: 'terminal' })

  const titles = await ui.findAll({ type: 'Text', text: /^(Facts|Risks|Results|Failures)$/ })
  expect(titles.map(found => found.text)).toEqual(['Failures', 'Results', 'Risks', 'Facts'])
  await ui.unmount()
})

test('a reply without markers, or with markers only in code, keeps the engine drawing', async $ => {
  for (const text of ['plain reply', '```\n🔴 not a heading\n```']) {
    const ui = await $.ui.mount({ ...makeSut(text, false), surface: 'terminal' })

    expect(await ui.findAll({ type: 'Markdown' })).toHaveLength(0)
    expect(await ui.find({ type: 'Text', text: /▌/ })).toBeUndefined()
    await ui.unmount()
  }
})
