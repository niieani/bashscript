import {ASTExpression, ASTList, TraverseState, ASTObject, TraverseScope} from './types'
import {emptyContext} from './context'
import {reduceAST} from './reducers'
import {ensureArray} from '../util/array'

export const print = (ast: ASTExpression | ASTList, context: TraverseState = emptyContext) => {
  const {partsToExtract, parts} = reduceAST(ensureArray(ast), context)
  return [...partsToExtract, ...parts].join('')
}
