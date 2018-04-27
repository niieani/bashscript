import {combineAlternate} from './array'

describe('array utils', () => {
  test('combineAlternate', () => {
    expect(combineAlternate(['a', 'b', 'c'], [1, 2, 3])).toMatchObject([
      'a',
      1,
      'b',
      2,
      'c',
      3,
    ])
  })
})
