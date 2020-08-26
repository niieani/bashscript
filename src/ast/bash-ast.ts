import {combineAlternate} from '../util/array'

export interface AstNode<Type extends string> {
  type: Type
}

export type AssignmentValue =
  | undefined
  | StringLiteral
  | ArrayLiteral
  | TemplateLiteral

/**
 * @example
 * ```shell
 * declare name="${1:-default}"
 * ```
 */
export interface Parameter extends AstNode<'Parameter'> {
  identifier: VariableIdentifier
  valueType?: 'STRING' | 'INTEGER' | 'ARRAY' | 'ASSOCIATIVE_ARRAY'
  // TODO: default value
  // TODO: valueType: 'STRING' | 'NUMBER' | 'ARRAY'
  // although maybe for readonly it makes sense?
}

const DECLARE_FLAGS = {
  STRING: [],
  INTEGER: ['i'],
  ARRAY: ['a'],
  ASSOCIATIVE_ARRAY: ['A'],
}

function writeParameter(
  {identifier, valueType = 'STRING'}: Parameter,
  index: number,
): string {
  const flags = DECLARE_FLAGS[valueType]
  const flagArg = flags.length > 0 ? `-${flags.join('')} ` : ''
  return `local ${flagArg}${write(identifier)}="\${${index}}"`
  // if (default) {
  //   output += `=${write(initializer)}`
  // }
}

/**
 * @example
 * ```shell
 * "something ${variable} $(command arg) ${variable:-default}"
 * ```
 */
export interface TemplateLiteral extends AstNode<'TemplateLiteral'> {
  expressions: Array<VariableReference | CallReference> // TODO: add expressions like $(( 1 + 2 ))
  quasis: Array<TemplateElement>
}

function writeTemplateLiteral({expressions, quasis}: TemplateLiteral): string {
  const expressionOutput = expressions.map((expression) => write(expression))
  const quasisOutput = quasis.map((quasis) => write(quasis))
  return `"${combineAlternate(quasisOutput, expressionOutput).join('')}"`
}

export interface TemplateElement extends AstNode<'TemplateElement'> {
  value: string
}

function writeTemplateElement({value}: TemplateElement): string {
  return value
}

export interface StringLiteral extends AstNode<'StringLiteral'> {
  style: 'UNQUOTED' | 'SINGLE_QUOTED' | 'DOUBLE_QUOTED' | 'HEREDOC'
  value: string
}

const SH_ESCAPED_SLASH = String.fromCodePoint(92) + "'"

function writeStringLiteral({style, value}: StringLiteral): string {
  switch (style) {
    // TODO: add support for all types
    case 'SINGLE_QUOTED':
    default:
      return `'${value.replace(/'/g, `'${SH_ESCAPED_SLASH}'`)}'`
  }
}

/**
 * @example
 * ```shell
 * ("value" "another value")
 * ```
 */
export interface ArrayLiteral extends AstNode<'ArrayLiteral'> {
  elements: Array<StringLiteral | TemplateLiteral>
}

function writeArrayLiteral({elements}: ArrayLiteral): string {
  return `(${elements.map((element) => write(element)).join(' ')})`
}

/**
 * The reference to a variable
 * @example ${name}
 * @example ${1}
 */
export interface VariableReference extends AstNode<'VariableReference'> {
  identifier: VariableIdentifier
  // TODO: modifiers, fallback value, etc.
}

function writeVariableReference({identifier}: VariableReference): string {
  return `\${${write(identifier)}}`
}

/**
 * The reference to a subshell evaluation
 * @example $(ls)
 */
export interface CallReference extends AstNode<'CallReference'> {
  expression: CallExpression
}

function writeCallReference({expression}: CallReference): string {
  return `\$(${write(expression)})`
}

/**
 * @example
 * ```shell
 * command some-arg "another arg" "$(subcommand arg2)"
 * ```
 */
export interface CallExpression extends AstNode<'CallExpression'> {
  callee: FunctionIdentifier
  args: Array<StringLiteral | TemplateLiteral>
}

function writeCallExpression({callee, args}: CallExpression): string {
  let output = write(callee)
  if (args.length > 0) {
    output += ' ' + args.map((argument) => write(argument)).join(' ')
  }
  return output
}

/**
 * Variable name
 */
export interface VariableIdentifier extends AstNode<'VariableIdentifier'> {
  name: string
}

function writeVariableIdentifier({name}: VariableIdentifier): string {
  return name
}

/**
 * The reference to a function
 */
export interface FunctionIdentifier extends AstNode<'FunctionIdentifier'> {
  name: string
}

function writeFunctionIdentifier({name}: FunctionIdentifier): string {
  return name
}

/**
 * @example
 * ```shell
 * name=value
 * ```
 */
export interface AssignmentExpression extends AstNode<'AssignmentExpression'> {
  identifier: VariableIdentifier
  value: AssignmentValue
  operator: '=' | '+='
}

function writeAssignmentExpression({
  identifier,
  operator,
  value,
}: AssignmentExpression): string {
  let output = `${write(identifier)}${operator}`
  if (value) {
    output += write(value)
  }
  return output
}

/**
 * @example
 * ```shell
 * declare name=value
 * ```
 */
export interface VariableDeclaration extends AstNode<'VariableDeclaration'> {
  identifier: VariableIdentifier
  initializer: AssignmentValue
  // TODO: consider valueType: 'STRING' | 'NUMBER' | 'ARRAY'; probably not needed, we can infer from initializer type
}

function writeVariableDeclaration({
  identifier,
  initializer,
}: VariableDeclaration): string {
  let output = `declare ${write(identifier)}`
  if (initializer) {
    output += `=${write(initializer)}`
  }
  return output
}

// expressions legal inside of a function body:
export type FunctionBodyExpression = VariableDeclaration | CallExpression

/**
 * @example
 * ```shell
 * function name() {
 *   local param="$1"
 *   true
 * }
 * ```
 */
export interface FunctionDeclaration extends AstNode<'FunctionDeclaration'> {
  name: FunctionIdentifier
  /** parameters are not a native bash feature, but we want this in the writer for ease of use */
  parameters: Array<Parameter>
  statements: Array<FunctionBodyExpression>
}

function writeFunctionDeclaration(
  {name, parameters, statements}: FunctionDeclaration,
  indentation = 0,
): string {
  let output = `function ${write(name)} {\n`

  const innerIndentation = indentation + 2
  const spacing = ' '.repeat(innerIndentation)

  output += parameters
    .map((parameter, index) => spacing + writeParameter(parameter, index))
    .join('\n')

  output += '\n'

  output += statements
    .map((statement) => spacing + write(statement, innerIndentation))
    .join('\n')

  output += '\n}'

  return output
}

/**
 * The reference to a function
 */
export interface UnsupportedSyntax extends AstNode<'UnsupportedSyntax'> {
  message: string
}

function writeUnsupportedSyntax(node: UnsupportedSyntax): string {
  return ''
}

export type FileExpression = FunctionBodyExpression | FunctionDeclaration

export interface BashFile extends AstNode<'File'> {
  statements: Array<FileExpression>
}

function writeFile({statements}: BashFile): string {
  return statements.map((statement) => write(statement)).join('\n')
}

///////////

export type NodeWriters = typeof WRITERS
export type NodeTypes = keyof NodeWriters
export type AllNodeWriters = {
  [K in keyof NodeWriters]: NodeWriters[K] extends typeof unimplementedWriter
    ? (node: AstNode<K>) => string
    : NodeWriters[K]
}

export type ImplementedNodeTypes = {
  [K in keyof NodeWriters]: NodeWriters[K] extends typeof unimplementedWriter
    ? never
    : K
}[keyof NodeWriters]

export type AllBashASTNodes = Parameters<NodeWriters[ImplementedNodeTypes]>[0]

const WRITERS = {
  ArrayLiteral: writeArrayLiteral,
  AssignmentExpression: writeAssignmentExpression,
  CallExpression: writeCallExpression,
  CallReference: writeCallReference,
  File: writeFile,
  FunctionDeclaration: writeFunctionDeclaration,
  FunctionIdentifier: writeFunctionIdentifier,
  Parameter: writeParameter,
  StringLiteral: writeStringLiteral,
  TemplateElement: writeTemplateElement,
  TemplateLiteral: writeTemplateLiteral,
  VariableDeclaration: writeVariableDeclaration,
  VariableIdentifier: writeVariableIdentifier,
  VariableReference: writeVariableReference,
  UnsupportedSyntax: writeUnsupportedSyntax,
}

function unimplementedWriter({type}: AstNode<string>): never {
  throw new Error(`Writer for ${type} is not supported yet`)
}

export function write(node: AllBashASTNodes, indentation = 0) {
  const writer = WRITERS[node.type] as (
    node: AstNode<string>,
    indentation?: number,
  ) => string
  return writer(node, indentation)
}

// NOTE: maybe it could be using 'typescript' directly as a TS plugin?
// then we could also add red squiggly marks for not implemented features, by node type in a given position!
// https://github.com/microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin
