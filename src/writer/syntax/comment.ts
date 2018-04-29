import {ASTObject} from '../types'
import {ensureStarter} from './starter'
import {terminator} from './terminator'
import {defaultReduce} from '../reducers'

export const comment = (
  comment: string,
  withSpace = true,
): ASTObject<{comment: string}> => ({
  reduce: defaultReduce,
  type: 'comment',
  parts: [ensureStarter, `#${withSpace ? ' ' : ''}${comment}`, terminator],
  data: {comment},
})


