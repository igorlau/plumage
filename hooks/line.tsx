import type { Elements, RenderNode } from 'claude-code'

type Drawing = Pick<Elements['terminal'], 'Box' | 'Text'>

// shortcut: the line stops after 1000 rows of one transcript row; raise it if a reply that tall shows a gap.
const LINE_ROWS = 1000

export const column = ({ Box, Text }: Drawing, top = 0) => (
  <Box bottom={0} left={0} overflow="hidden" position="absolute" top={top} width={1}>
    <Text dimColor>{'│\n'.repeat(LINE_ROWS)}</Text>
  </Box>
)

export const lined = (drawing: Drawing, children: RenderNode | RenderNode[]) => {
  const { Box } = drawing

  return (
    <Box flexDirection="column">
      {column(drawing)}
      <Box flexDirection="column" paddingLeft={2}>
        {children}
      </Box>
    </Box>
  )
}

export const track = (drawing: Drawing, nodes: RenderNode | RenderNode[], paddingTop = 1) => {
  const { Box } = drawing

  return (
    <Box flexDirection="column" paddingTop={paddingTop}>
      {column(drawing)}
      {nodes}
    </Box>
  )
}

export const replyLine = (drawing: Drawing & Pick<Elements['terminal'], 'Markdown'>, text: string) => {
  const { Markdown } = drawing

  return track(drawing, node(drawing, <Markdown text={text} />))
}

export const node = ({ Box, Text }: Drawing, children: RenderNode | RenderNode[], marginTop = 0) => (
  <Box marginTop={marginTop}>
    <Box flexShrink={0} width={2}>
      <Text dimColor>├</Text>
    </Box>
    <Box flexDirection="column" flexGrow={1}>
      {children}
    </Box>
  </Box>
)
