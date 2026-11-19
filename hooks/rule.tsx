import type { Elements } from 'claude-code'

export const rule = ({ Box, Text }: Pick<Elements['terminal'], 'Box' | 'Text'>, columns: number) => (
  <Box flexGrow={1} height={1} marginLeft={1} overflow="hidden">
    <Text dimColor>{'─'.repeat(columns)}</Text>
  </Box>
)
