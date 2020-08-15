import * as AST from 'ts-morph'
import * as acorn from 'acorn'
import {comment} from '../writer/syntax/comment'
import {ASTObject} from '../writer/types'

export const getCommentObjects = (node: AST.Node) =>
  getComments(node).map((text) => comment(text, false))

export const getComments = (astNode: AST.Node) => {
  const leading = astNode.getLeadingCommentRanges()
  const trailing = astNode.getTrailingCommentRanges()
  const commentRanges = [...leading, ...trailing]
  const comments: Array<acorn.Comment> = []
  commentRanges.forEach((range) => {
    acorn.parse(range.getText(), {
      ecmaVersion: 2020,
      ranges: false,
      onComment: comments,
      allowHashBang: true,
    })
  })
  return comments.map((comment) => `${comment.value.split('\n').join('\n#')}`)
}
