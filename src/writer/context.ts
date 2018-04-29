import {ASTObject, NoData, TraverseState} from './types'
import {createScopeProxy} from './scope-proxy'

export const astRoot: ASTObject<NoData> = {
  type: 'root',
  data: {},
  reduce: (ctx) => ctx,
}

export const emptyContext: TraverseState = {
  parts: [],
  partsToExtract: [],
  processed: [],
  scopePath: [],
  scope: createScopeProxy(),
  parent: astRoot,
  indent: 0,
}
