'use client'
// Paramètres : compte, confidentialité, notifications, langue, application, aide et zone sensible.
// Liste groupée « façon iOS / Instagram », pensée pour le téléphone d'abord.
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { APP_NAME, CONTACT_EMAIL, DELETION_GRACE_DAYS } from '@/lib/appInfo'
import { requestAccountDeletion } from '@/lib/account'
import { getNotifPrefs, updateNotifPrefs, type NotifPrefs } from '@/lib/notifPrefs'
import { exportMyData } from '@/lib/exportData'
import { useInstallPrompt } from '@/lib/useInstallPrompt'
import Icon from '../components/Icon'
import LanguageSelector from '../components/LanguageSelector'
import { Skeleton, btn, page, useUI } from '../components/ui'
import { Group, Row, ToggleRow } from './rows'
import { AboutSheet, BlockedSheet, EmailSheet, MessageSheet, MutedSheet, PasswordSheet, type WhoCanMessage } from './sheets'

type Sheets = 'email' | 'password' | 'blocked' | 'muted' | 'message' | 'about' | null

export default function SettingsPage() {
  const { t } = useI18n()
  const { toast, confirm } = useUI()
  const install = useInstallPrompt()

  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [loaded, setLoaded] = useState(false)
  const [isPrivate, setIsPrivate] = useState(false)
  const [whoCanMessage, setWhoCanMessage] = useState<WhoCanMessage>('everyone')
  const [prefs, setPrefs] = useState<NotifPrefs>({})
  const [sheet, setSheet] = useState<Sheets>(null)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showIosHelp, setShowIosHelp] = useState(false)

  // Page protégée : sans compte connecté, retour à /login
  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.assign('/login'); return }
      setUserId(data.user.id)
      setEmail(data.user.email || '')
      const [{ data: prof }, notif] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle(),
        getNotifPrefs(),
      ])
      setIsPrivate(!!prof?.is_private)
      setWhoCanMessage(prof?.who_can_message === 'following' ? 'following' : 'everyone')
      setPrefs(notif)
      setLoaded(true)
    })
  }, [])

  /* ---------------- Confidentialité ---------------- */
  // Mise à jour immédiate ; si l'enregistrement échoue, on remet l'ancienne valeur
  const savePrivate = async (value: boolean) => {
    if (!userId) return
    setIsPrivate(value)
    const { error } = await supabase.from('profiles').update({ is_private: value }).eq('id', userId)
    if (error) { setIsPrivate(!value); toast(t('settings.saveFailed'), 'error'); return }
    toast(t('common.saved'))
  }

  const saveWhoCanMessage = async (value: WhoCanMessage) => {
    if (!userId || value === whoCanMessage) return
    const before = whoCanMessage
    setWhoCanMessage(value)
    const { error } = await supabase.from('profiles').update({ who_can_message: value }).eq('id', userId)
    if (error) { setWhoCanMessage(before); toast(t('settings.saveFailed'), 'error'); return }
    toast(t('common.saved'))
  }

  const doExport = async () => {
    setExporting(true)
    toast(t('settings.exporting'), 'info')
    const ok = await exportMyData()
    setExporting(false)
    toast(ok ? t('settings.exported') : t('common.error'), ok ? 'success' : 'error')
  }

  /* ---------------- Notifications ---------------- */
  // absent = activé
  const notifOn = (key: 'follow' | 'comment' | 'reaction') => prefs[key] !== false
  const saveNotif = async (key: 'follow' | 'comment' | 'reaction', value: boolean) => {
    const before = prefs[key]
    setPrefs(p => ({ ...p, [key]: value }))
    const ok = await updateNotifPrefs({ [key]: value })
    if (!ok) { setPrefs(p => ({ ...p, [key]: before })); toast(t('settings.saveFailed'), 'error'); return }
    toast(t('common.saved'))
  }

  /* ---------------- Compte ---------------- */
  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.assign('/login')
  }

  const signOutEverywhere = async () => {
    const ok = await confirm({
      title: t('settings.signOutAllTitle'), message: t('settings.signOutAllText'),
      confirmLabel: t('settings.signOutAllConfirm'), danger: true,
    })
    if (!ok) return
    const { error } = await supabase.auth.signOut({ scope: 'global' })
    if (error) { toast(t('common.error'), 'error'); return }
    window.location.assign('/login')
  }

  const deleteAccount = async () => {
    const ok = await confirm({
      title: t('settings.deleteTitle'), message: t('settings.deleteText', { n: DELETION_GRACE_DAYS }),
      confirmLabel: t('settings.deleteConfirm'), danger: true,
    })
    if (!ok) return
    setDeleting(true)
    const done = await requestAccountDeletion()
    if (!done) { setDeleting(false); toast(t('common.error'), 'error'); return }
    toast(t('settings.deleteDone'))
    window.location.assign('/login')
  }

  /* ---------------- Application ---------------- */
  const doInstall = async () => {
    if (install.canInstall) {
      const accepted = await install.promptInstall()
      if (accepted) toast(t('settings.installDone'))
    } else if (install.showIosHelp) {
      setShowIosHelp(v => !v)
    }
  }

  const invite = async () => {
    const url = window.location.origin
    const text = t('settings.inviteText')
    try {
      if (navigator.share) { await navigator.share({ title: APP_NAME, text, url }); return }
    } catch (e) { if ((e as Error)?.name === 'AbortError') return }
    try { await navigator.clipboard.writeText(`${text} ${url}`); toast(t('common.copied')) }
    catch { toast(t('common.error'), 'error') }
  }

  const goBack = () => {
    if (window.history.length > 1) window.history.back()
    else window.location.assign('/profile')
  }

  const header = (
    <header className="flex items-center gap-2 mb-6">
      <button onClick={goBack} aria-label={t('common.back')} className={`${btn.icon} -ms-2`}>
        <Icon name="chevronLeft" size={22} />
      </button>
      <h1 className="text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
    </header>
  )

  /* ---------------- Chargement ---------------- */
  if (!loaded) {
    return (
      <main className={page} aria-busy="true">
        {header}
        {[3, 4, 3].map((rows, g) => (
          <div key={g} className="mt-8 first:mt-0">
            <Skeleton className="h-4 w-28 mb-3" />
            <div className="flex flex-col gap-2">{Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-14" />)}</div>
          </div>
        ))}
      </main>
    )
  }

  const showInstall = install.ready && !install.installed && (install.canInstall || install.showIosHelp)

  return (
    <main className={page}>
      {header}

      <Group title={t('settings.account')}>
        <Row icon="mail" title={t('settings.email')} value={email} />
        <Row icon="pencil" title={t('settings.changeEmail')} chevron onClick={() => setSheet('email')} />
        <Row icon="key" title={t('settings.changePassword')} chevron onClick={() => setSheet('password')} />
        <Row icon="shield" title={t('settings.signOutAll')} onClick={signOutEverywhere} />
        <Row icon="logOut" title={t('settings.signOut')} onClick={signOut} />
      </Group>

      <Group title={t('settings.privacy')}>
        <ToggleRow icon="lock" title={t('settings.privateAccount')} hint={t('settings.privateAccountHint')}
          checked={isPrivate} onChange={savePrivate} />
        <Row icon="message" title={t('settings.whoCanMessage')} chevron onClick={() => setSheet('message')}
          value={whoCanMessage === 'following' ? t('settings.msgFollowing') : t('settings.msgEveryone')} />
        <Row icon="ban" title={t('settings.blocked')} chevron onClick={() => setSheet('blocked')} />
        <Row icon="download" title={t('settings.export')} hint={t('settings.exportHint')} busy={exporting} onClick={doExport} />
      </Group>

      <Group title={t('settings.notifications')}>
        <ToggleRow icon="userPlus" title={t('settings.notifFollow')} checked={notifOn('follow')} onChange={v => saveNotif('follow', v)} />
        <ToggleRow icon="message" title={t('settings.notifComment')} checked={notifOn('comment')} onChange={v => saveNotif('comment', v)} />
        <ToggleRow icon="heart" title={t('settings.notifReaction')} checked={notifOn('reaction')} onChange={v => saveNotif('reaction', v)} />
        <Row icon="bellOff" title={t('settings.muted')} chevron onClick={() => setSheet('muted')}
          value={(prefs.muted?.length || 0) > 0 ? prefs.muted?.length : undefined} />
      </Group>

      <Group title={t('settings.language')}>
        <div className="flex items-center justify-between gap-3 ps-4 pe-2 min-h-14 py-1">
          <span className="flex items-center gap-3 text-sm font-medium">
            <span className="w-9 h-9 rounded-xl bg-surface-2 text-muted flex items-center justify-center shrink-0"><Icon name="globe" size={18} /></span>
            {t('settings.language')}
          </span>
          <LanguageSelector showName />
        </div>
      </Group>

      <Group title={t('settings.app')}>
        {showInstall && (
          <>
            <Row icon="phone" title={t('settings.install')} hint={t('settings.installHint')} chevron onClick={doInstall} />
            {install.showIosHelp && showIosHelp && (
              <p className="px-4 py-3 text-sm text-muted bg-surface-2 animate-fade-in" role="status">{t('settings.installIos')}</p>
            )}
          </>
        )}
        <Row icon="share" title={t('settings.invite')} onClick={invite} />
        <Row icon="chart" title={t('settings.statsLink')} href="/stats" chevron />
      </Group>

      <Group title={t('settings.help')}>
        <Row icon="help" title={t('settings.helpCenter')} href="/help" chevron />
        <Row icon="mail" title={t('settings.support')} external chevron
          href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(t('settings.supportSubject'))}`} />
        <Row icon="doc" title={t('settings.terms')} href="/terms" chevron />
        <Row icon="shield" title={t('settings.privacyPolicy')} href="/privacy" chevron />
        <Row icon="info" title={t('settings.legal')} href="/legal" chevron />
        <Row icon="info" title={t('settings.about')} chevron onClick={() => setSheet('about')} />
      </Group>

      <Group title={t('settings.danger')} danger>
        <Row icon="trash" title={t('settings.deleteAccount')} danger busy={deleting} onClick={deleteAccount} />
      </Group>

      <EmailSheet open={sheet === 'email'} onClose={() => setSheet(null)} current={email} />
      <PasswordSheet open={sheet === 'password'} onClose={() => setSheet(null)} />
      <BlockedSheet open={sheet === 'blocked'} onClose={() => setSheet(null)} />
      <MutedSheet open={sheet === 'muted'} onClose={() => setSheet(null)} ids={prefs.muted || []}
        onChange={muted => setPrefs(p => ({ ...p, muted }))} />
      <MessageSheet open={sheet === 'message'} onClose={() => setSheet(null)} value={whoCanMessage} onPick={saveWhoCanMessage} />
      <AboutSheet open={sheet === 'about'} onClose={() => setSheet(null)} />
    </main>
  )
}
