/**
 * Combines two arrays by alternating their indices
 * combineAlternate([a, b, c], [1, 2, 3]) === [a, 1, b, 2, c, 3]
 */
export const combineAlternate = <T, Y>(
  arr1: Array<T>,
  arr2: Array<Y>,
  noLengthCheck = false,
  flipOrder = false,
): Array<T | Y> =>
  noLengthCheck || arr1.length >= arr2.length
    ? arr1.reduce(
        (combined, arr1value, index) =>
          index < arr2.length
            ? [
                ...combined,
                ...(flipOrder
                  ? [arr2[index], arr1value]
                  : [arr1value, arr2[index]]),
              ]
            : [...combined, arr1value],
        [] as Array<T | Y>,
      )
    : combineAlternate(arr2, arr1, true, true)

export const findLastIndex = <T>(
  predicate: (value: T, index: number, obj: T[]) => boolean,
) => (arr: ReadonlyArray<T>) => {
  const result = arr
    .slice()
    .reverse()
    .findIndex(predicate)
  return result >= 0 ? arr.length - 1 - result : result
}

export const last = <T>(array: Array<T>): T | undefined =>
  array.slice().reverse()[0]

export const ensureArray = <T>(maybeArray: T | Array<T>): Array<T> =>
  Array.isArray(maybeArray) ? maybeArray : [maybeArray]
