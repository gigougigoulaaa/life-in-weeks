'use client'
// Fenêtres (Sheet) de la page Paramètres : e-mail, mot de passe, personnes bloquées,
// conversations en sourdine, qui peut m'écrire, à propos.
import { useEffect, useState, type FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { getBlockedPeople, unblockUser, type BlockedPerson } from '@/lib/moderation'
import { toggleMuted } from '@/lib/notifPrefs'
import { APP_NAME, APP_VERSION, CONTACT_EMAIL } from '@/lib/appInfo'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { Avatar, EmptyState, Sheet, Skeleton, Spinner, btn, input, useUI } from '../components/ui'

/* ---------------- Changer l'e-mail ---------------- */
export function EmailSheet({ open, onClose, current }: { open: boolean, onClose: () => void, current: string }) {
  const { t } = useI18n()
  const { toast } = useUI()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const close = () => { setEmail(''); setError(''); onClose() }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(value)) { setError(t('settings.emailInvalid')); return }
    if (value.toLowerCase() === current.toLowerCase()) { setError(t('settings.emailSame')); return }
    setBusy(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ email: value })
    setBusy(false)
    if (err) { setError(t('common.error')); toast(t('common.error'), 'error'); return }
    toast(t('settings.emailSent'), 'success', { duration: 6000 })
    close()
  }

  return (
    <Sheet open={open} onClose={close} title={t('settings.changeEmail')}>
      <form onSubmit={submit} className="p-5 flex flex-col gap-4">
        <p className="text-sm text-muted">{current}</p>
        <div>
          <label htmlFor="new-email" className="block text-sm font-medium mb-1.5">{t('settings.newEmail')}</label>
          <input id="new-email" type="email" value={email} onChange={e => setEmail(e.target.value)} autoFocus
            autoComplete="email" inputMode="email" aria-invalid={!!error} aria-describedby={error ? 'new-email-err' : undefined}
            className={input} />
          {error && <p id="new-email-err" role="alert" className="text-danger text-xs mt-1.5">{error}</p>}
        </div>
        <button type="submit" disabled={busy || !email.trim()} className={btn.primary}>
          {busy && <Spinner size={16} />}{t('settings.emailSend')}
        </button>
      </form>
    </Sheet>
  )
}

/* ---------------- Changer le mot de passe ---------------- */
export function PasswordSheet({ open, onClose }: { open: boolean, onClose: () => void }) {
  const { t } = useI18n()
  const { toast } = useUI()
  const [pwd, setPwd] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const close = () => { setPwd(''); setConfirm(''); setError(''); onClose() }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (pwd.length < 6) { setError(t('settings.passwordShort')); return }
    if (pwd !== confirm) { setError(t('settings.passwordMismatch')); return }
    setBusy(true); setError('')
    const { error: err } = await supabase.auth.updateUser({ password: pwd })
    setBusy(false)
    if (err) { setError(t('common.error')); toast(t('common.error'), 'error'); return }
    toast(t('settings.passwordChanged'))
    close()
  }

  return (
    <Sheet open={open} onClose={close} title={t('settings.changePassword')}>
      <form onSubmit={submit} className="p-5 flex flex-col gap-4">
        <div>
          <label htmlFor="new-pwd" className="block text-sm font-medium mb-1.5">{t('settings.newPassword')}</label>
          <input id="new-pwd" type="password" value={pwd} onChange={e => setPwd(e.target.value)} autoFocus
            autoComplete="new-password" minLength={6} className={input} />
        </div>
        <div>
          <label htmlFor="confirm-pwd" className="block text-sm font-medium mb-1.5">{t('settings.confirmPassword')}</label>
          <input id="confirm-pwd" type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
            autoComplete="new-password" aria-invalid={!!error} aria-describedby={error ? 'pwd-err' : undefined} className={input} />
          {error && <p id="pwd-err" role="alert" className="text-danger text-xs mt-1.5">{error}</p>}
        </div>
        <button type="submit" disabled={busy || !pwd || !confirm} className={btn.primary}>
          {busy && <Spinner size={16} />}{t('common.confirm')}
        </button>
      </form>
    </Sheet>
  )
}

/* ---------------- Personnes bloquées ---------------- */
// La liste interne n'est montée que quand la fenêtre est ouverte : elle se charge donc à chaque ouverture.
function PersonRow({ person, actionLabel, busy, onAction }: {
  person: { id: string, username: string | null, full_name: string | null, avatar_url: string | null },
  actionLabel: string, busy: boolean, onAction: () => void
}) {
  const { t } = useI18n()
  const name = person.full_name || person.username || t('common.user')
  return (
    <li className="flex items-center gap-3 px-3 min-h-16 py-2">
      <Avatar url={person.avatar_url} name={name} size={44} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        {person.username && person.username !== name && <p className="text-xs text-muted truncate">@{person.username}</p>}
      </div>
      <button onClick={onAction} disabled={busy} className={`${btn.secondary} h-10 px-4`}>
        {busy && <Spinner size={14} />}{actionLabel}
      </button>
    </li>
  )
}

function BlockedList() {
  const { t } = useI18n()
  const { toast } = useUI()
  const [people, setPeople] = useState<BlockedPerson[] | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    getBlockedPeople().then(list => { if (alive) setPeople(list) })
    return () => { alive = false }
  }, [])

  const unblock = async (p: BlockedPerson) => {
    setBusyId(p.id)
    const ok = await unblockUser(p.id)
    setBusyId(null)
    if (!ok) { toast(t('common.error'), 'error'); return }
    setPeople(list => (list || []).filter(x => x.id !== p.id))
    toast(t('mod.unblocked'))
  }

  if (people === null) return <div className="p-4 flex flex-col gap-3">{[0, 1, 2].map(i => <Skeleton key={i} className="h-14" />)}</div>
  if (people.length === 0) return <EmptyState icon="ban" title={t('settings.blockedEmptyTitle')} text={t('settings.blockedEmptyText')} />
  return (
    <ul className="p-2">
      {people.map(p => (
        <PersonRow key={p.id} person={p} actionLabel={t('mod.unblock')} busy={busyId === p.id} onAction={() => unblock(p)} />
      ))}
    </ul>
  )
}

export function BlockedSheet({ open, onClose }: { open: boolean, onClose: () => void }) {
  const { t } = useI18n()
  return <Sheet open={open} onClose={onClose} title={t('settings.blocked')}><BlockedList /></Sheet>
}

/* ---------------- Conversations en sourdine ---------------- */
type Person = { id: string, username: string | null, full_name: string | null, avatar_url: string | null }

function MutedList({ ids, onChange }: { ids: string[], onChange: (ids: string[]) => void }) {
  const { t } = useI18n()
  const { toast } = useUI()
  const [people, setPeople] = useState<Person[] | null>(ids.length === 0 ? [] : null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    if (ids.length === 0) return
    let alive = true
    Promise.resolve(supabase.from('profiles').select('id, username, full_name, avatar_url').in('id', ids))
      .then(({ data }) => { if (alive) setPeople((data as Person[]) || []) })
      .catch(() => { if (alive) setPeople([]) })
    return () => { alive = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const unmute = async (p: Person) => {
    setBusyId(p.id)
    const nowMuted = await toggleMuted(p.id)
    setBusyId(null)
    if (nowMuted === null) { toast(t('common.error'), 'error'); return }
    if (!nowMuted) {
      setPeople(list => (list || []).filter(x => x.id !== p.id))
      onChange(ids.filter(x => x !== p.id))
      toast(t('settings.unmuted'))
    }
  }

  if (people === null) return <div className="p-4 flex flex-col gap-3">{[0, 1].map(i => <Skeleton key={i} className="h-14" />)}</div>
  if (people.length === 0) return <EmptyState icon="bellOff" title={t('settings.mutedEmptyTitle')} text={t('settings.mutedEmptyText')} />
  return (
    <ul className="p-2">
      {people.map(p => (
        <PersonRow key={p.id} person={p} actionLabel={t('settings.unmute')} busy={busyId === p.id} onAction={() => unmute(p)} />
      ))}
    </ul>
  )
}

export function MutedSheet({ open, onClose, ids, onChange }: {
  open: boolean, onClose: () => void, ids: string[], onChange: (ids: string[]) => void
}) {
  const { t } = useI18n()
  return <Sheet open={open} onClose={onClose} title={t('settings.muted')}><MutedList ids={ids} onChange={onChange} /></Sheet>
}

/* ---------------- Qui peut m'écrire ---------------- */
export type WhoCanMessage = 'everyone' | 'following'

export function MessageSheet({ open, onClose, value, onPick }: {
  open: boolean, onClose: () => void, value: WhoCanMessage, onPick: (v: WhoCanMessage) => void
}) {
  const { t } = useI18n()
  const options: { key: WhoCanMessage, label: string, hint: string }[] = [
    { key: 'everyone', label: t('settings.msgEveryone'), hint: t('settings.msgEveryoneHint') },
    { key: 'following', label: t('settings.msgFollowing'), hint: t('settings.msgFollowingHint') },
  ]
  return (
    <Sheet open={open} onClose={onClose} title={t('settings.whoCanMessage')}>
      <div role="radiogroup" aria-label={t('settings.whoCanMessage')} className="p-3 flex flex-col gap-1">
        {options.map(o => {
          const on = value === o.key
          return (
            <button key={o.key} type="button" role="radio" aria-checked={on} onClick={() => { onPick(o.key); onClose() }}
              className="w-full flex items-center gap-3 px-3 min-h-16 py-2 rounded-xl text-start hover:bg-surface-2 active:bg-surface-3 transition">
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="block text-xs text-muted mt-0.5">{o.hint}</span>
              </span>
              <span className={`w-6 h-6 rounded-full border flex items-center justify-center shrink-0 ${on ? 'bg-brand border-brand text-ink' : 'border-line-strong'}`}>
                {on && <Icon name="check" size={14} strokeWidth={3} />}
              </span>
            </button>
          )
        })}
      </div>
    </Sheet>
  )
}

/* ---------------- À propos ---------------- */
export function AboutSheet({ open, onClose }: { open: boolean, onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Sheet open={open} onClose={onClose} title={t('settings.about')}>
      <div className="flex flex-col items-center text-center px-6 py-10">
        <div className="w-16 h-16 rounded-2xl bg-brand-soft flex items-center justify-center mb-4"><Logo size={36} /></div>
        <p className="text-xl font-semibold tracking-tight">{APP_NAME}</p>
        <p className="text-sm text-muted mt-1">{t('settings.version', { v: APP_VERSION })}</p>
        <p className="text-sm text-muted mt-6 flex items-center gap-1.5"><Icon name="heart" size={14} className="text-brand" />{t('settings.madeWithCare')}</p>
        <a href={`mailto:${CONTACT_EMAIL}`} className={`${btn.secondary} mt-6`}>
          <Icon name="mail" size={16} />{t('settings.contact')}
        </a>
      </div>
    </Sheet>
  )
}
