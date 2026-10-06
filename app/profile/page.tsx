'use client'
// Mon profil : identité, « ma vie en semaines », statistiques, moments favoris et grille de photos.
// Le bouton crayon ouvre le mode édition (photo, nom, bio, favoris, langue, compte).
import { useEffect, useMemo, useState, type ChangeEvent } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useI18n } from '@/lib/i18n'
import { uploadMedia, isVideoUrl, MAX_IMAGE_MB } from '@/lib/media'
import { createLifeImage, shareOrDownload, weekKey, weeksLivedSince, LIFE_WEEKS, LIFE_YEARS } from '@/lib/shareImage'
import Icon, { type IconName } from '../components/Icon'
import LanguageSelector from '../components/LanguageSelector'
import { Avatar, btn, card, input, EmptyState, Sheet, Skeleton, Spinner, useUI } from '../components/ui'

type Event = { text?: string, description?: string, photos?: string[] }
type Week = {
  id: string, year: number, week_number: number, title?: string | null, content?: string | null,
  days?: { events?: Event[] }[] | null, media_urls?: string[] | null, location?: { name?: string } | null,
}
type Profile = {
  id: string, username?: string | null, full_name?: string | null, bio?: string | null,
  avatar_url?: string | null, birth_date?: string | null, favorite_weeks?: string[] | null,
}

// Toutes les photos/vidéos d'une semaine (galerie de la semaine + photos des évènements)
function mediaOf(w: Week): string[] {
  const all = [...(w.media_urls || []), ...(w.days || []).flatMap(d => (d?.events || []).flatMap(e => e?.photos || []))]
  return Array.from(new Set(all.filter(Boolean)))
}

// Une semaine compte comme « remplie » si elle contient quelque chose
function isFilled(w: Week): boolean {
  return !!(w.title || w.content || mediaOf(w).length || (w.days || []).some(d => (d?.events || []).length > 0))
}

const weekHref = (w: Week) => `/calendar?y=${w.year}&w=${w.week_number}`

export default function ProfilePage() {
  const { t, fmtNumber } = useI18n()
  const { toast, confirm } = useUI()

  const [user, setUser] = useState<{ id: string, email?: string } | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [weeks, setWeeks] = useState<Week[]>([])
  const [loaded, setLoaded] = useState(false)
  const [now] = useState(() => new Date())

  // Champs du mode édition
  const [editing, setEditing] = useState(false)
  const [username, setUsername] = useState('')
  const [fullName, setFullName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [favoriteWeeks, setFavoriteWeeks] = useState<string[]>([])
  const [pickerOpen, setPickerOpen] = useState(false)

  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const fillForm = (p: Profile | null) => {
    setUsername(p?.username || '')
    setFullName(p?.full_name || '')
    setBio(p?.bio || '')
    setAvatarUrl(p?.avatar_url || '')
    setFavoriteWeeks(p?.favorite_weeks || [])
  }

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.assign('/login'); return }
      setUser({ id: data.user.id, email: data.user.email })
      const [{ data: prof }, { data: rows }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', data.user.id).maybeSingle(),
        supabase.from('weeks').select('id, year, week_number, title, content, days, media_urls, location')
          .eq('user_id', data.user.id)
          .order('year', { ascending: false }).order('week_number', { ascending: false }),
      ])
      setProfile((prof as Profile) || null)
      fillForm((prof as Profile) || null)
      setWeeks((rows as Week[]) || [])
      setLoaded(true)
    })
  }, [])

  /* ---------------- Valeurs calculées ---------------- */
  const birthDate = profile?.birth_date ? new Date(profile.birth_date) : null
  const lived = birthDate ? weeksLivedSince(birthDate, now) : 0
  const pct = Math.min(100, Math.round((lived / LIFE_WEEKS) * 1000) / 10)
  const age = birthDate ? Math.max(0, Math.floor((now.getTime() - birthDate.getTime()) / (365.2425 * 86400000))) : 0

  const mediaWeeks = useMemo(() => weeks
    .map(w => ({ week: w, media: mediaOf(w) }))
    .filter(x => x.media.length > 0), [weeks])

  const countries = useMemo(() => {
    const set = new Set<string>()
    for (const w of weeks) {
      const parts = w.location?.name?.split(',')
      if (parts?.length) set.add(parts[parts.length - 1].trim())
    }
    return set.size
  }, [weeks])

  const filledWeeks = useMemo(() => new Set(weeks.filter(isFilled).map(w => weekKey(w.year, w.week_number))), [weeks])
  // Série en cours : semaines consécutives remplies (la semaine actuelle peut encore être vide)
  const streak = useMemo(() => {
    const d = new Date(now.getFullYear(), 0, 1)
    let y = now.getFullYear()
    let w = Math.ceil(((now.getTime() - d.getTime()) / 86400000 + d.getDay() + 1) / 7)
    const prev = (yy: number, ww: number): [number, number] =>
      ww > 1 ? [yy, ww - 1] : [yy - 1, filledWeeks.has(weekKey(yy - 1, 53)) ? 53 : 52]
    if (!filledWeeks.has(weekKey(y, w))) [y, w] = prev(y, w)
    let n = 0
    while (filledWeeks.has(weekKey(y, w)) && n < 5000) { n++; [y, w] = prev(y, w) }
    return n
  }, [filledWeeks, now])
  const favorites = weeks.filter(w => (profile?.favorite_weeks || []).includes(w.id))
  const titledWeeks = weeks.filter(w => w.title)

  const shownName = profile?.full_name || profile?.username || t('common.user')
  const showHandle = !!profile?.username && profile.username !== shownName

  /* ---------------- Actions ---------------- */
  const shareProfile = async () => {
    if (!user) return
    const url = `${window.location.origin}/profile/${user.id}`
    try {
      if (navigator.share) { await navigator.share({ title: shownName, url }); return }
    } catch (e) { if ((e as Error)?.name === 'AbortError') return }
    try { await navigator.clipboard.writeText(url); toast(t('profile.linkCopied')) }
    catch { toast(t('common.error'), 'error') }
  }

  const shareLife = async () => {
    if (!birthDate || sharing) return
    setSharing(true)
    try {
      const blob = await createLifeImage({
        name: shownName, birthDate, filledWeeks,
        subtitle: t('share.subtitle', { n: fmtNumber(lived), p: fmtNumber(pct) }),
      })
      await shareOrDownload(blob, 'life-in-weeks.png', t('share.title'))
    } catch {
      toast(t('share.failed'), 'error')
    }
    setSharing(false)
  }

  const uploadAvatar = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de choisir à nouveau la même photo
    if (!file || !user) return
    setUploading(true)
    const res = await uploadMedia('avatars', '', file, { upsertName: `avatar_${user.id}`, maxDim: 512 })
    if (res.url) {
      setAvatarUrl(res.url)
      // La photo est enregistrée tout de suite, sans attendre « Sauvegarder »
      const { error } = await supabase.from('profiles').upsert({ id: user.id, avatar_url: res.url })
      if (error) toast(t('common.error'), 'error')
      else { setProfile(p => ({ ...(p || { id: user.id }), avatar_url: res.url })); toast(t('profile.photoSaved')) }
    } else {
      toast(res.error === 'tooBig' ? t('media.tooBig', { n: MAX_IMAGE_MB }) : res.error === 'unsupported' ? t('media.unsupported') : t('media.failed'), 'error')
    }
    setUploading(false)
  }

  const saveProfile = async () => {
    if (!user || saving) return
    setSaving(true)
    const values = {
      id: user.id,
      username: username.trim() || null,
      full_name: fullName.trim(),
      bio: bio.trim(),
      avatar_url: avatarUrl,
      favorite_weeks: favoriteWeeks,
    }
    const { error } = await supabase.from('profiles').upsert(values)
    setSaving(false)
    if (error) {
      // 23505 = valeur déjà utilisée (nom d'utilisateur unique)
      toast(error.code === '23505' ? t('profile.usernameTaken') : t('common.error'), 'error')
      return
    }
    setProfile(p => ({ ...(p || {}), ...values }))
    toast(t('profile.saved'))
    setEditing(false)
    window.scrollTo({ top: 0 })
  }

  const toggleFavorite = (id: string) =>
    setFavoriteWeeks(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const logout = async () => {
    await supabase.auth.signOut()
    window.location.assign('/login')
  }

  const deleteAccount = async () => {
    const ok = await confirm({
      title: t('account.deleteTitle'), message: t('account.deleteMessage'),
      confirmLabel: t('account.deleteConfirm'), danger: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      const { data } = await supabase.auth.getSession()
      const res = await fetch('/api/delete-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
      })
      if (res.status === 501) { toast(t('account.notConfigured'), 'error'); setDeleting(false); return }
      if (!res.ok) throw new Error(String(res.status))
      toast(t('account.deleted'))
      await supabase.auth.signOut()
      window.location.assign('/login')
    } catch {
      toast(t('common.error'), 'error')
      setDeleting(false)
    }
  }

  const openEdit = () => { fillForm(profile); setEditing(true); window.scrollTo({ top: 0 }) }

  /* ---------------- Mode édition ---------------- */
  if (editing) {
    return (
      <main className="mx-auto w-full max-w-xl px-4 sm:px-6 pt-6 pb-nav animate-fade-in">
        <header className="flex items-center gap-2 mb-6">
          <button onClick={() => setEditing(false)} aria-label={t('common.back')} className={`${btn.icon} -ms-2`}>
            <Icon name="chevronLeft" size={22} />
          </button>
          <h1 className="flex-1 text-xl font-semibold tracking-tight truncate">{t('profile.editTitle')}</h1>
          <button onClick={saveProfile} disabled={saving} className={`${btn.primary} h-10 px-4`}>
            {saving && <Spinner size={14} />}{t('common.save')}
          </button>
        </header>

        {/* Photo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <label className="relative cursor-pointer group" aria-label={t('profile.changePhoto')}>
            <Avatar url={avatarUrl} name={fullName || username} size={96} />
            <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
              <Icon name="camera" size={24} />
            </span>
            {uploading && <span className="absolute inset-0 rounded-full bg-black/60 flex items-center justify-center"><Spinner size={24} /></span>}
            <span className="absolute bottom-0 end-0 w-8 h-8 rounded-full bg-brand text-ink flex items-center justify-center border-2 border-ink">
              <Icon name="camera" size={15} />
            </span>
            <input type="file" accept="image/*" onChange={uploadAvatar} disabled={uploading} className="sr-only" />
          </label>
          <span className="text-sm text-brand font-medium">{t('profile.changePhoto')}</span>
        </div>

        {/* Informations */}
        <section className="flex flex-col gap-5">
          <div>
            <label htmlFor="fullName" className="block text-sm font-medium mb-1.5">{t('profile.fullName')}</label>
            <input id="fullName" value={fullName} maxLength={60} onChange={e => setFullName(e.target.value)}
              placeholder={t('profile.namePh')} className={input} />
          </div>
          <div>
            <label htmlFor="username" className="block text-sm font-medium mb-1.5">{t('profile.username')}</label>
            <div className="relative">
              <span className="absolute start-3.5 top-1/2 -translate-y-1/2 text-subtle text-sm pointer-events-none">@</span>
              <input id="username" value={username} maxLength={30} autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, ''))}
                className={`${input} ps-8`} />
            </div>
            <p className="text-xs text-subtle mt-1.5">{t('profile.usernameHint')}</p>
          </div>
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="bio" className="text-sm font-medium">{t('profile.bio')}</label>
              <span className="text-xs text-subtle tabular-nums">{bio.length}/300</span>
            </div>
            <textarea id="bio" value={bio} rows={4} maxLength={300} onChange={e => setBio(e.target.value)}
              placeholder={t('profile.aboutPh')} className={`${input} h-auto py-3 resize-none leading-relaxed`} />
          </div>
          <div>
            <p className="text-sm font-medium mb-1.5">{t('profile.favorites')}</p>
            <button onClick={() => setPickerOpen(true)}
              className={`${input} flex items-center justify-between gap-3 text-start hover:bg-surface-3`}>
              <span className="flex items-center gap-2 min-w-0">
                <Icon name="sparkles" size={16} className="text-brand" />
                <span className="truncate">{favoriteWeeks.length > 0 ? t('profile.selectedMoments', { n: favoriteWeeks.length }) : t('profile.favChoose')}</span>
              </span>
              <Icon name="chevronRight" size={18} className="text-subtle" />
            </button>
            <p className="text-xs text-subtle mt-1.5">{t('profile.favHint')}</p>
          </div>
          <button onClick={saveProfile} disabled={saving} className={`${btn.primary} w-full`}>
            {saving && <Spinner size={16} />}{t('home.saveProfile')}
          </button>
        </section>

        {/* Préférences */}
        <h2 className="text-sm font-semibold mt-10 mb-3">{t('profile.preferences')}</h2>
        <div className={`${card} flex items-center justify-between gap-3 ps-4 pe-2 h-14`}>
          <span className="flex items-center gap-3 text-sm"><Icon name="globe" size={18} className="text-muted" />{t('common.language')}</span>
          <LanguageSelector showName />
        </div>

        {/* Compte */}
        <h2 className="text-sm font-semibold mt-8 mb-3">{t('profile.account')}</h2>
        <div className={`${card} divide-y divide-line overflow-hidden`}>
          {user?.email && (
            <div className="flex items-center gap-3 px-4 h-14 text-sm">
              <Icon name="user" size={18} className="text-muted" />
              <span className="text-muted truncate">{user.email}</span>
            </div>
          )}
          <Link href="/privacy" className="flex items-center gap-3 px-4 h-14 text-sm hover:bg-surface-2 transition">
            <Icon name="shield" size={18} className="text-muted" />
            <span className="flex-1">{t('nav.privacy')}</span>
            <Icon name="chevronRight" size={18} className="text-subtle" />
          </Link>
          <button onClick={logout} className="w-full flex items-center gap-3 px-4 h-14 text-sm text-start hover:bg-surface-2 transition">
            <Icon name="logOut" size={18} className="text-muted" />
            <span className="flex-1">{t('profile.logout')}</span>
          </button>
        </div>
        <button onClick={deleteAccount} disabled={deleting} className={`${btn.danger} w-full mt-4 disabled:opacity-50`}>
          {deleting ? <Spinner size={16} /> : <Icon name="trash" size={16} />}
          {deleting ? t('account.deleting') : t('account.delete')}
        </button>

        {/* Choix des moments favoris */}
        <Sheet open={pickerOpen} onClose={() => setPickerOpen(false)} title={t('profile.favPick')}
          headerExtra={<button onClick={() => setPickerOpen(false)} className={`${btn.ghost} text-brand`}>{t('common.done')}</button>}>
          {titledWeeks.length === 0 ? (
            <EmptyState icon="sparkles" title={t('profile.noTitled')} />
          ) : (
            <ul className="p-2">
              {titledWeeks.map(w => {
                const on = favoriteWeeks.includes(w.id)
                return (
                  <li key={w.id}>
                    <button onClick={() => toggleFavorite(w.id)} aria-pressed={on}
                      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-start hover:bg-surface-2 transition">
                      <span className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${on ? 'bg-brand border-brand text-ink' : 'border-line-strong'}`}>
                        {on && <Icon name="check" size={14} strokeWidth={3} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-medium truncate">{w.title}</span>
                        <span className="block text-xs text-subtle">{t('search.weekYear', { n: w.week_number, year: w.year })}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </Sheet>
      </main>
    )
  }

  /* ---------------- Chargement ---------------- */
  if (!loaded) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-6 pb-nav">
        <div className="flex items-center gap-4"><Skeleton className="w-20 h-20 rounded-full" /><div className="flex-1 flex flex-col gap-2"><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-24" /></div></div>
        <Skeleton className="h-56 mt-6 rounded-2xl" />
        <div className="grid grid-cols-3 gap-1 mt-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="aspect-square rounded-md" />)}</div>
      </main>
    )
  }

  /* ---------------- Vue du profil ---------------- */
  const stats: { icon: IconName, value: number, label: string }[] = [
    { icon: 'clock', value: lived, label: t('profile.weeksLived') },
    { icon: 'globe', value: countries, label: t('profile.countries') },
    { icon: 'pencil', value: weeks.filter(isFilled).length, label: t('profile.memoriesWritten') },
    { icon: 'image', value: mediaWeeks.length, label: t('profile.photoWeeks') },
    { icon: 'sparkles', value: streak, label: t('profile.streak') },
    { icon: 'heart', value: favorites.length, label: t('profile.favoritesCount') },
  ]

  return (
    <main className="mx-auto w-full max-w-5xl px-4 sm:px-6 pt-6 pb-nav animate-fade-in">
      <div className="lg:grid lg:grid-cols-[360px_minmax(0,1fr)] lg:gap-8 lg:items-start">

        {/* Colonne gauche : identité, vie en semaines, statistiques */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <section>
            <div className="flex items-start gap-4">
              <Avatar url={profile?.avatar_url} name={shownName} size={80} />
              <div className="flex-1 min-w-0 pt-2">
                <h1 className="text-2xl font-semibold tracking-tight break-words line-clamp-2">{shownName}</h1>
                {showHandle && <p className="text-muted text-sm truncate">@{profile?.username}</p>}
              </div>
              <div className="flex items-center gap-1 -me-2">
                <button onClick={shareProfile} aria-label={t('profile.shareLink')} title={t('profile.shareLink')} className={btn.icon}>
                  <Icon name="share" size={20} />
                </button>
                <button onClick={openEdit} aria-label={t('profile.edit')} title={t('profile.edit')} className={btn.icon}>
                  <Icon name="pencil" size={20} />
                </button>
              </div>
            </div>
            {profile?.bio && <p className="text-sm text-fg/85 leading-relaxed mt-4 whitespace-pre-line">{profile.bio}</p>}
            {!profile?.bio && !profile?.avatar_url && (
              <button onClick={openEdit} className={`${card} w-full mt-4 flex items-center gap-3 p-4 text-start hover:bg-surface-2 transition`}>
                <span className="w-10 h-10 rounded-xl bg-brand-soft text-brand flex items-center justify-center shrink-0"><Icon name="user" size={18} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium">{t('profile.complete')}</span>
                  <span className="block text-xs text-muted mt-0.5">{t('profile.emptyText')}</span>
                </span>
                <Icon name="chevronRight" size={18} className="text-subtle" />
              </button>
            )}
          </section>

          {/* Ma vie en semaines */}
          <section className={`${card} p-5`}>
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-sm font-semibold">{t('profile.lifeTitle')}</h2>
              {birthDate && <span className="text-brand font-semibold tabular-nums">{fmtNumber(pct)} %</span>}
            </div>
            {birthDate ? (
              <>
                <p className="text-xs text-muted mt-1">
                  {t('profile.lifeOf', { n: fmtNumber(lived), total: fmtNumber(LIFE_WEEKS) })} · {t('profile.age', { n: age })}
                </p>
                <div className="h-2 rounded-full bg-surface-3 mt-4 overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
                </div>
                {/* 90 points : un par année de vie */}
                <div dir="ltr" className="grid gap-1.5 mt-5" style={{ gridTemplateColumns: 'repeat(15, minmax(0, 1fr))' }} aria-hidden="true">
                  {Array.from({ length: LIFE_YEARS }, (_, i) => (
                    <span key={i} className={`aspect-square rounded-full ${i === age ? 'bg-brand shadow-[0_0_8px_#f5b544]' : i < age ? 'bg-fg/45' : 'border border-line-strong'}`} />
                  ))}
                </div>
                <p className="text-xs text-subtle mt-3">{t('profile.yearsLegend')}</p>
                <button onClick={shareLife} disabled={sharing} className={`${btn.secondary} w-full mt-4`}>
                  {sharing ? <Spinner size={16} /> : <Icon name="share" size={16} />}
                  {sharing ? t('profile.shareLifeBusy') : t('profile.shareLife')}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted mt-2 leading-relaxed">{t('profile.noBirth')}</p>
                <Link href="/calendar" className={`${btn.secondary} w-full mt-4`}><Icon name="calendar" size={16} />{t('profile.openCalendar')}</Link>
              </>
            )}
          </section>

          {/* Statistiques */}
          <section aria-label={t('profile.statsTitle')} className="grid grid-cols-2 gap-3">
            {stats.map(s => (
              <div key={s.label} className={`${card} p-4`}>
                <span className="w-8 h-8 rounded-lg bg-surface-2 text-muted flex items-center justify-center"><Icon name={s.icon} size={16} /></span>
                <p className="text-2xl font-semibold tracking-tight mt-3 tabular-nums">{fmtNumber(s.value)}</p>
                <p className="text-xs text-muted mt-0.5">{s.label}</p>
              </div>
            ))}
          </section>
        </aside>

        {/* Colonne principale : moments favoris + grille de photos */}
        <div className="flex flex-col gap-8 mt-8 lg:mt-0">
          {favorites.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold mb-3 flex items-center gap-2"><Icon name="sparkles" size={16} className="text-brand" />{t('profile.favorites')}</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {favorites.map(w => {
                  const cover = mediaOf(w).find(u => !isVideoUrl(u))
                  return (
                    <Link key={w.id} href={weekHref(w)} className={`${card} overflow-hidden flex flex-col hover:border-line-strong hover:bg-surface-2 transition active:scale-[0.99]`}>
                      {cover && <img src={cover} alt="" loading="lazy" className="w-full h-32 object-cover bg-surface-2" />}
                      <div className="p-4">
                        <p className="text-xs font-medium text-brand">{t('search.weekYear', { n: w.week_number, year: w.year })}</p>
                        {w.title && <p className="font-semibold mt-1 truncate">{w.title}</p>}
                        {w.content && <p className="text-sm text-muted mt-1 line-clamp-2">{w.content}</p>}
                        {w.location?.name && <p className="flex items-center gap-1 text-xs text-subtle mt-2"><Icon name="mapPin" size={12} /><span className="truncate">{w.location.name}</span></p>}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </section>
          )}

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold flex items-center gap-2"><Icon name="grid" size={16} className="text-muted" />{t('profile.mediaTitle')}</h2>
              {mediaWeeks.length > 0 && <span className="text-xs text-subtle tabular-nums">{fmtNumber(mediaWeeks.length)}</span>}
            </div>
            {mediaWeeks.length === 0 ? (
              <div className={card}>
                <EmptyState icon="image" title={t('profile.mediaEmpty')} text={t('profile.mediaEmptyText')}
                  action={<Link href="/calendar" className={btn.secondary}><Icon name="calendar" size={16} />{t('profile.openCalendar')}</Link>} />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1 sm:gap-2">
                {mediaWeeks.map(({ week, media }) => {
                  const first = media.find(u => !isVideoUrl(u)) || media[0]
                  const video = isVideoUrl(first)
                  return (
                    <Link key={week.id} href={weekHref(week)} title={week.title || undefined}
                      className="group relative aspect-square overflow-hidden rounded-md sm:rounded-lg bg-surface-2">
                      {video
                        ? <video src={`${first}#t=0.1`} muted playsInline preload="metadata" className="w-full h-full object-cover" />
                        : <img src={first} alt="" loading="lazy" className="w-full h-full object-cover transition duration-300 group-hover:scale-105" />}
                      {(video || media.length > 1) && (
                        <span className="absolute top-1.5 end-1.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                          <Icon name={video ? 'play' : 'album'} size={16} filled={video} />
                        </span>
                      )}
                      <span className="absolute inset-x-0 bottom-0 p-2 pt-6 bg-gradient-to-t from-black/70 to-transparent text-[11px] font-medium text-white opacity-0 group-hover:opacity-100 transition">
                        {t('search.weekYear', { n: week.week_number, year: week.year })}
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        </div>
      </div>
    </main>
  )
}
