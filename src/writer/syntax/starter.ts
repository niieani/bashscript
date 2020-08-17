import {ASTObject, NoData, ScopeContext, TraverseState} from '../types'
import {findLastIndex, last} from '../../util/array'

export const NEW_LINE = '\n'
export const SEMI = '; '

// TODO: should we differentiate start of content flow (terminated by \n) vs inline content (a; b;)?
/**
 * marks the start of a new statement in indented content flow
 */
export const STARTER: ASTObject<NoData> = {
  type: 'starter',
  data: {},
  reduce(context): TraverseState {
    const {processed, parts, indent} = context
    return {
      ...context,
      parts: indent ? [...parts, ''.padStart(indent)] : parts,
      processed: [...processed, this],
    }
  },
}

export const lastStarterAt = findLastIndex(
  ({type}: ASTObject) => type === 'starter',
)

export const isBeginningOfLine = (context: TraverseState) => {
  const token = last(context.parts)
  return !token || token === NEW_LINE
}

export const ensureStarter = ({_context: context}: ScopeContext) =>
  context.indent > 0 && isBeginningOfLine(context) ? STARTER : ''
