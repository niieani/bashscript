import {
  ASTExpression,
  ASTObject,
  DeclarationData,
  FunctionAST,
  VariableData,
  TraverseScope,
  TraverseState,
} from '../types'
import {defaultReduce} from '../reducers'
import {STARTER} from './starter'
import {ast, statement} from '../statement'
import {addToScopeAndWrite, inIsolatedScope} from '../scope'
import {VisitorReturn} from '../../visitors'
import {coerceStringToAST} from '../context-util'
import {raw} from './raw'

export const declare = (
  variable: ASTExpression,
  initializer?: ASTExpression,
): ASTObject<DeclarationData> => ({
  parts:
    initializer !== undefined
      ? statement`declare ${variable}=${initializer}`
      : statement`declare ${variable}`,
  type: 'declaration',
  data: {variable, initializer},
  reduce: defaultReduce,
})

export const declareVariable = (
  name: string,
  initializer?: ASTExpression,
): ASTObject<DeclarationData> => declare(addToScopeAndWrite(name), initializer)

export const SH_ESCAPED_SLASH = String.fromCodePoint(92) + "'"

export const escapedString = (value: string): ASTObject<{value: string}> => ({
  type: 'string-literal',
  parts: ["'", value.replace(/'/g, "'" + SH_ESCAPED_SLASH + "'"), "'"],
  data: {value},
  reduce: defaultReduce,
})

type CallExpressionData = {
  callable: string
  args: VisitorReturn[]
  argComments: string
}

const ARGUMENT_SEPARATOR: ASTObject<{
  text: string
}> = {
  ...raw(' '),
  type: 'argument-separator',
}

export const callExpression = ({
  args,
  argComments,
  callable,
}: CallExpressionData): ASTObject<CallExpressionData> => ({
  type: 'call-expression',
  parts: statement`${(ctx) => ctx[callable] || callable}${
    args.length ? ' ' : ''
  }${args
    .map((arg, index) =>
      index < arg.length ? [arg, ARGUMENT_SEPARATOR] : [arg],
    )
    .flat(1)}${argComments}`,
  data: {args, argComments, callable},
  reduce: defaultReduce,
})

export const inlineCallExpression = (
  expression: ASTObject<CallExpressionData>,
): ASTObject<{expression: ASTObject<CallExpressionData>}> => ({
  type: 'inline-call-expression',
  parts: statement`\$(${expression})`,
  data: {expression},
  reduce: defaultReduce,
})

export const referenceVar = (
  name: string | number,
): ASTObject<VariableData> => ({
  type: 'variable',
  parts: [ast`\${${name.toString()}}`],
  data: {name},
  reduce: defaultReduce,
})

export const declareFunction = ({
  name,
  body,
  as,
}: FunctionAST): ASTObject<FunctionAST> => ({
  type: 'function',
  data: {name, body, as},
  reduce: defaultReduce,
  parts: statement`function ${addToScopeAndWrite(name, as)} {
${inIsolatedScope(body, name)}${STARTER}}`,
})

/* WIP:
const functionCall = ({
  name,
  args,
  comments,
}) => ({
  type: 'call',
  data: {name, args, comments},
  reduce: defaultReduce,
  parts: statement`${(ctx) => ctx[name] || name} ${args}${comments && ` # ${comments}`}`
})
*/
