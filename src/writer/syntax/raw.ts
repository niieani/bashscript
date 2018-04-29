import {ASTObject} from '../types'

export const raw = (text : string) : ASTObject<{text : string}> => (
  {
    reduce: function reduce({processed, parts, ...context}) {
      return {
        ...context,
        processed: [...processed, this],
        parts: [...parts, text],
      }
    },
    parts: [text],
    data: {text},
    type: 'raw',
  }
)