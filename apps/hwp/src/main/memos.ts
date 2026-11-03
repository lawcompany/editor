import { hwpMemosOf } from '@genoffice/file-parse'
import { lostMemoCountOf as countLost, type MemoLossInput } from '../shared/document/memos'
export type { MemoLossInput } from '../shared/document/memos'

export function lostMemoCountOf(input: MemoLossInput): Promise<number> {
  return countLost(input, hwpMemosOf)
}
