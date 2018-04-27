export const flatmapSimple = <T>(nestedArray: Array<Array<T>>): Array<T> =>
  ([] as Array<T>).concat(...nestedArray)
