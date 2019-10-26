import {ScopeDefinition, TraverseScope} from './types'

export const createScopeProxy = (scope: TraverseScope = {}) =>
  new Proxy(scope, {
    get: function(target, property, receiver): ScopeDefinition {
      if (property in target) {
        return target[property as string]!
      }
      // workaround for jest:
      if (property === 'getMockName') return (() => 'Scope') as any
      if (property === 'mock') return {calls: []} as any

      return {
        type: 'unknown',
        data: {},
        length: property.toString().length,
        reduce: (context) => context,
        parts: [],
        toString: () => property.toString(),
      }
    },
  })
