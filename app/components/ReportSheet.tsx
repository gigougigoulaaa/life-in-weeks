'use client'
// Fenêtre « Signaler » : choix d'une raison + précisions, utilisée partout (profil, commentaire, message, semaine).
import { useState } from 'react'
import { useI18n } from '@/lib/i18n'
import { REPORT_REASONS, sendReport, type ReportReason, type ReportTarget } from '@/lib/moderation'
import { Sheet, Spinner, btn, input, useUI } from './ui'

export default function ReportSheet({ target, onClose }: { target: ReportTarget | null, onClose: () => void }) {
  const { t } = useI18n()
  const { toast } = useUI()
  const [reason, setReason] = useState<ReportReason | null>(null)
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)

  const close = () => { setReason(null); setDetails(''); onClose() }
  const send = async () => {
    if (!target || !reason || sending) return
    setSending(true)
    const ok = await sendReport(target, reason, details)
    setSending(false)
    if (ok) { toast(t('mod.sent')); close() } else toast(t('mod.sendFailed'), 'error')
  }

  return (
    <Sheet open={!!target} onClose={close} title={t('mod.reportTitle')}>
      <div className="p-5 space-y-4">
        <p className="text-sm text-muted">{t('mod.reportIntro')}</p>
        <div className="space-y-2" role="radiogroup">
          {REPORT_REASONS.map(r => (
            <button key={r} role="radio" aria-checked={reason === r} onClick={() => setReason(r)}
              className={`w-full min-h-12 px-4 rounded-xl border text-start text-sm transition ${reason === r ? 'border-brand bg-brand-soft text-fg' : 'border-line bg-surface-2 text-muted hover:bg-surface-3'}`}>
              {t(`mod.reason.${r}`)}
            </button>
          ))}
        </div>
        <textarea value={details} onChange={e => setDetails(e.target.value)} maxLength={500} rows={3}
          placeholder={t('mod.detailsPh')} className={`${input} h-auto py-3 resize-none`} />
        <button onClick={send} disabled={!reason || sending} className={`${btn.primary} w-full`}>
          {sending && <Spinner size={16} />}{t('mod.send')}
        </button>
      </div>
    </Sheet>
  )
}
