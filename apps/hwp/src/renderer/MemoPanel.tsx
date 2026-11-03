import type { ReactElement } from 'react'
import { useI18n } from './i18n/locale'
import { MemoPanelView, type MemoPanelProps } from './memo-panel-view'
export * from './memo-panel-view'

export function MemoPanel(props: MemoPanelProps): ReactElement {
  return <MemoPanelView {...props} locale={useI18n()} host={window.hwpApi} />
}
