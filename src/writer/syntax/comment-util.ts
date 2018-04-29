import {ASTObject, CommentData} from '../types'

export const getInlineComments = (objects : Array<ASTObject>) =>
  objects.filter((obj) => obj.type === 'comment-inline') as Array<ASTObject<CommentData>>