interface AstNode<Type extends string = string> {
  type: Type
}

type Expression = VariableDeclaration | FunctionDeclaration | CallExpression

interface BashFile extends AstNode<'File'> {
  statements: Array<Expression>
}

/**
 * @example
 * ```shell
 * declare name=value
 * ```
 */
interface VariableDeclaration extends AstNode<'VariableDeclaration'> {
  identifier: VariableIdentifier
  initializer: undefined | StringLiteral | ArrayLiteral
  // TODO: probably not needed, we can infer from initializer type: valueType: 'STRING' | 'NUMBER' | 'ARRAY'
}

/**
 * @example
 * ```shell
 * function name() {
 *   local param="$1"
 *   true
 * }
 * ```
 */
interface FunctionDeclaration extends AstNode<'FunctionDeclaration'> {
  name: FunctionIdentifier
  parameters: Array<VariableDeclaration>
  statements: Array<Expression>
}

/**
 * @example
 * ```shell
 * command some-arg "another arg" "$(subcommand arg2)"
 * ```
 */
interface CallExpression extends AstNode<'CallExpression'> {
  callee: FunctionIdentifier
  arguments: Array<StringLiteral | TemplateLiteral>
}

/**
 * "something ${variable} $(command arg) ${variable:-default}"
 */
interface TemplateLiteral extends AstNode<'TemplateLiteral'> {
  expressions: Array<VariableReference | CallExpression> // TODO: add expressions like $(( 1 + 2 ))
  quasis: Array<TemplateElement>
}

/**
 * The reference to a variable
 * @example ${name}
 * @example ${1}
 */
interface VariableReference extends AstNode<'VariableReference'> {
  identifier: VariableIdentifier
  // TODO: modifiers, fallback value, etc.
}

/**
 * The reference to a variable
 */
interface VariableIdentifier extends AstNode<'VariableIdentifier'> {
  name: string
}

/**
 * The reference to a function
 */
interface FunctionIdentifier extends AstNode<'FunctionIdentifier'> {
  name: string
}

interface StringLiteral extends AstNode<'StringLiteral'> {
  style: 'UNQUOTED' | 'SINGLE_QUOTED' | 'DOUBLE_QUOTED' | 'HEREDOC'
  value: string
}

interface TemplateElement extends AstNode<'TemplateElement'> {
  value: string
}

/**
 * @example
 * ```shell
 * ("value" "another value")
 * ```
 */
interface ArrayLiteral extends AstNode<'ArrayLiteral'> {
  elements: Array<StringLiteral>
}

const SH_ESCAPED_SLASH = String.fromCodePoint(92) + "'"

const writeStringLiteral = ({style, value}: StringLiteral) => {
  switch (style) {
    // TODO: add support for all types
    case 'SINGLE_QUOTED':
    default:
      return `'${value.replace(/'/g, `'${SH_ESCAPED_SLASH}'`)}'`
  }
}

function unimplementedWriter({type}: AstNode): never {
  throw new Error(`Writer for ${type} is not supported yet`)
}

const WRITERS = {
  VariableDeclaration: writeVariableDeclaration,
  StringLiteral: writeStringLiteral,
  FunctionDeclaration: writeFunctionDeclaration,
  CallExpression: unimplementedWriter,
  ArrayLiteral: unimplementedWriter,
}

type NodeWriters = typeof WRITERS
type NodeTypes = keyof NodeWriters
type AllNodeWriters = {
  [K in keyof NodeWriters]: NodeWriters[K] extends typeof unimplementedWriter
    ? (node: AstNode<K>) => string
    : NodeWriters[K]
}
type ImplementedNodeTypes = {
  [K in keyof NodeWriters]: NodeWriters[K] extends typeof unimplementedWriter
    ? never
    : K
}[keyof NodeWriters]

const write = <T extends NodeTypes, N extends Parameters<AllNodeWriters[T]>[0]>(
  node: N,
) => {
  const writer = WRITERS[node.type] as (node: AstNode) => string
  return writer(node)
}

function writeVariableDeclaration({
  identifier,
  initializer,
}: VariableDeclaration) {
  let output = 'declare ${identifier}'
  if (initializer) {
    output += `=${write(initializer)}`
  }
  return output
}

function writeFunctionDeclaration(node: FunctionDeclaration) {
  return 'TODO'
}

function writeFile(file: BashFile) {
  const statements = file.statements.map((statement) => write(statement))
}
