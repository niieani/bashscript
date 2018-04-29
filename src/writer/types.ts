export type ScopeDefinition = ASTObject & {toString(): string; length: number}

export interface TraverseScope {
  [variableName: string]:
    | ScopeDefinition
    | undefined
}

export interface TraverseState {
  parts: Array<string>
  partsToExtract: Array<string>
  processed: Array<ASTObject>
  scopePath: Array<string>
  parent: ASTObject
  indent: number
  scope: TraverseScope
}

export type ScopeContext = {
  _context: TraverseState
} & TraverseScope

export type ScopeContextToAST<T = any> = (
  context: ScopeContext,
) => ASTResolvedExpression<T>

export interface ASTObject<T = any> {
  type: ASTType
  data: T
  reduce: (context: TraverseState) => TraverseState
  parts?: Array<ASTExpression>
}

export type ASTResolvedExpression<T = any> =
  | string
  | ASTObject<T>
  | Array<string | ASTObject>

export type ASTExpression =
  | ScopeContextToAST
  | ASTResolvedExpression
  | Array<ScopeContextToAST | ASTResolvedExpression>

export type ASTList = Array<ASTExpression>

export type ASTType =
  | 'root'
  | 'comment'
  | 'comment-inline'
  | 'declaration'
  | 'raw'
  | 'terminator'
  | 'starter'
  | 'enhance'
  | 'group'
  | 'function'
  | 'unknown'
  | 'variable'

export type CommentData = {comment: string}
export type NoData = {}
export type DeclarationData = {
  variable: ASTExpression
  initializer: ASTExpression | undefined
}

export type Reducer = (context: TraverseState) => TraverseState
export type DefinedReducer<T> = Reducer & {data: T}
export type FunctionAST = {
  name: string
  body: ASTExpression
  as?: ASTExpression
}

export type VariableData = {name: string | number}
