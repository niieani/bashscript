import {ASTObject, CommentData} from '../types'
import {ensureStarter} from './starter'
import {terminator} from './terminator'
import {defaultReduce} from '../writer'

export const comment = (
  comment: string,
  withSpace = true,
): ASTObject<{comment: string}> => ({
  reduce: defaultReduce,
  type: 'comment',
  parts: [ensureStarter, `#${withSpace ? ' ' : ''}${comment}`, terminator],
  data: {comment},
})

export const getInlineComments = (objects: Array<ASTObject>) =>
  objects.filter((obj) => obj.type === 'comment-inline') as Array<
    ASTObject<CommentData>
  >
