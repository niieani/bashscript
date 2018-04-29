import {ASTObject, NoData, TraverseState} from '../types'
import {newLine} from './starter'
import {findLastIndex} from '../../util/array'
import {getInlineComments} from './comment-util'

export const terminator: ASTObject<NoData> = {
  type: 'terminator',
  data: {},
  reduce: terminatorReduce,
}

export const lastTerminatorAt = findLastIndex(
  ({type}: ASTObject) => type === 'terminator',
)

export const contentSincePreviousTerminator = ({processed}: TraverseState) => {
  const previousTerminatorIndex = lastTerminatorAt(processed)
  return previousTerminatorIndex >= 0
    ? processed.slice(previousTerminatorIndex)
    : processed
}

export function terminatorReduce(
  this: ASTObject<NoData>,
  context: TraverseState,
): TraverseState {
  const {processed, parts} = context
  const sinceLastTerminator = contentSincePreviousTerminator(context)
  const comments = getInlineComments(sinceLastTerminator)
  const commentText = `# ${comments
    .map(({data: {comment: text}}) => text)
    .join(' | ')}`

  return {
    ...context,
    processed: [...processed, this],
    parts: comments.length
      ? [...parts, newLine, commentText]
      : [...parts, newLine],
  }
}
