import {ASTList, ASTObject, ASTType, TraverseState, TraverseScope} from './types'
import {emptyContext} from './context'
import {ensureASTObject} from './context-util'

export function defaultReduce(
  this : ASTObject,
  context : TraverseState,
) : TraverseState {
  const {processed, ...nextContext} = reduceAST(this.parts || [], context)
  return {
    ...nextContext,
    processed: [...processed, this],
  }
}

export const defineReducer = <T>({
  reducer,
  data,
} : {
  reducer : (context : TraverseState) => TraverseState
  data : T
}) => Object.assign(reducer, {data})

export const isSkipType = (type : ASTType) => {
  switch (type) {
    case 'enhance':
    case 'group':
      return true
    default:
      return false
  }
}

export const reduceAST = (
  ast : ASTList,
  {parent: astParent, ...context} : TraverseState = emptyContext,
) : TraverseState =>
  ast.reduce(
    (context : TraverseState, node) => {
      const parent = ensureASTObject(node, context)
      const parentSkipType = isSkipType(parent.type) ? context.parent : parent
      const newContext = parent.reduce({...context, parent: parentSkipType})
      return {...newContext, parent: astParent}
    },
    {...context, parent: astParent},
  )