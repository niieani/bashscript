import {ScopeContext} from '../writer/types'

export const passthrough = <T>(t: T) => t

export const getNameGenerator = (name: string) => <T>(
  wrapper: (t: string) => T = passthrough as (t: string) => T,
) => ({_context: {scopePath}}: ScopeContext) =>
  wrapper(`${scopePath.join('.')}.${name}`)
