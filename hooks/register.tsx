import type { Register } from 'claude-code'

import { recordReply, registerBand } from './band'
import { registerSections } from './sections'
import { closeTurn, registerTimeline } from './timeline'

export const register: Register = (on, options) => {
  const sections = options.sections !== false
  const timeline = options.timeline !== false
  const band = options.band !== false
  if (sections) {
    registerSections(on, { timeline })
  }
  if (timeline) {
    registerTimeline(on, { sections })
  }
  if (band) {
    registerBand(on)
  }
  if (!band && !timeline) {
    return
  }

  on('turn.complete', async ($, e, next) => {
    if (e.agentId !== undefined) {
      return next(e)
    }

    if (band) {
      await recordReply($, e.answer)
    }
    if (timeline) {
      await closeTurn($, e.answer, e.isAborted, await $.clock.now())
    }

    return next(e)
  })
}
