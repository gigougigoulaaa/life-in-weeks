'use client'
// Politique de confidentialité — lisible sans être connecté.
// ATTENTION : ce texte est un MODÈLE. Il doit être relu (idéalement par un juriste)
// et adapté avant une vraie mise en ligne publique.
// Le texte est écrit ici directement (français, sinon anglais) plutôt que dans les traductions,
// car un texte juridique doit être relu langue par langue.
import { useI18n } from '@/lib/i18n'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { btn } from '../components/ui'

// À REMPLACER par une vraie adresse de contact
const CONTACT_EMAIL = 'contact@exemple.com'
// Date de la dernière mise à jour du texte
const UPDATED_AT = new Date(2026, 9, 5)

type Section = { title: string, body: string[] }

const FR: { title: string, intro: string, updated: string, sections: Section[] } = {
  title: 'Politique de confidentialité',
  intro: "Life in Weeks est un journal personnel : vos souvenirs vous appartiennent. Cette page explique simplement quelles données nous conservons, pourquoi, et comment vous gardez le contrôle.",
  updated: 'Dernière mise à jour :',
  sections: [
    { title: 'Données collectées', body: [
      "Compte : votre adresse email et votre mot de passe (chiffré, nous ne le voyons jamais).",
      "Profil : nom d'utilisateur, nom, biographie, photo de profil et date de naissance (pour construire votre calendrier).",
      "Contenu : vos souvenirs, évènements, photos et vidéos, lieux associés à vos semaines, ainsi que vos messages, abonnements, commentaires et réactions.",
    ] },
    { title: 'Pourquoi nous les utilisons', body: [
      "Uniquement pour faire fonctionner l'application : afficher votre calendrier, enregistrer vos souvenirs, vous permettre d'échanger avec les personnes que vous suivez.",
      "Nous ne vendons pas vos données, nous n'affichons pas de publicité et nous ne les utilisons pas pour du profilage.",
    ] },
    { title: 'Hébergement', body: [
      "Les données et fichiers sont stockés chez Supabase (base de données et stockage). L'application est servie par Vercel. Ces prestataires agissent pour notre compte et sont soumis à des engagements de confidentialité.",
    ] },
    { title: 'Qui peut voir quoi', body: [
      "Tout est privé par défaut. Une semaine n'est visible par vos abonnés que si vous choisissez de la partager.",
      "Votre nom, votre photo et votre biographie sont visibles par les autres utilisateurs. Avec un compte privé, vous validez chaque demande d'abonnement.",
      "Les messages ne sont visibles que par vous et votre correspondant.",
    ] },
    { title: 'Durée de conservation', body: [
      "Vos données sont conservées tant que votre compte existe. Quand vous supprimez votre compte, vos souvenirs, fichiers, messages et abonnements sont effacés définitivement. Les copies de sauvegarde techniques disparaissent ensuite dans un délai limité.",
    ] },
    { title: 'Vos droits (RGPD)', body: [
      "Vous pouvez à tout moment accéder à vos données, les corriger ou les supprimer.",
      "Rectification : depuis votre profil, bouton « Modifier ».",
      "Suppression : Profil → Modifier → Compte → « Supprimer mon compte ». La suppression est immédiate et définitive.",
      "Vous pouvez aussi introduire une réclamation auprès de la CNIL (cnil.fr).",
    ] },
    { title: 'Contact', body: [
      `Pour toute question sur vos données : ${CONTACT_EMAIL}`,
    ] },
  ],
}

const EN: typeof FR = {
  title: 'Privacy Policy',
  intro: 'Life in Weeks is a personal journal: your memories belong to you. This page explains in plain words what data we keep, why, and how you stay in control.',
  updated: 'Last updated:',
  sections: [
    { title: 'Data we collect', body: [
      'Account: your email address and password (encrypted, we never see it).',
      'Profile: username, name, bio, profile photo and date of birth (used to build your calendar).',
      'Content: your memories, events, photos and videos, places linked to your weeks, as well as your messages, follows, comments and reactions.',
    ] },
    { title: 'Why we use it', body: [
      'Only to run the app: show your calendar, save your memories, and let you talk with the people you follow.',
      'We do not sell your data, show ads, or use it for profiling.',
    ] },
    { title: 'Hosting', body: [
      'Data and files are stored with Supabase (database and storage). The app is served by Vercel. These providers act on our behalf and are bound by confidentiality commitments.',
    ] },
    { title: 'Who can see what', body: [
      'Everything is private by default. A week is only visible to your followers if you choose to share it.',
      'Your name, photo and bio are visible to other users. With a private account, you approve every follow request.',
      'Messages are only visible to you and the person you are talking to.',
    ] },
    { title: 'How long we keep it', body: [
      'Your data is kept as long as your account exists. When you delete your account, your memories, files, messages and follows are permanently erased. Technical backups expire shortly after.',
    ] },
    { title: 'Your rights (GDPR)', body: [
      'You can access, correct or delete your data at any time.',
      'Correction: from your profile, “Edit” button.',
      'Deletion: Profile → Edit → Account → “Delete my account”. Deletion is immediate and permanent.',
      'You may also lodge a complaint with your data protection authority.',
    ] },
    { title: 'Contact', body: [
      `For any question about your data: ${CONTACT_EMAIL}`,
    ] },
  ],
}

export default function PrivacyPage() {
  const { lang, t } = useI18n()
  const c = lang === 'fr' ? FR : EN
  const updated = UPDATED_AT.toLocaleDateString(lang === 'fr' ? 'fr' : 'en', { day: 'numeric', month: 'long', year: 'numeric' })

  const goBack = () => {
    if (window.history.length > 1) window.history.back()
    else window.location.href = '/'
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 sm:px-6 pt-6 pb-nav">
      <div className="flex items-center justify-between mb-8">
        <button onClick={goBack} className={`${btn.ghost} -ms-3`}>
          <Icon name="chevronLeft" size={18} />{t('common.back')}
        </button>
        <Logo size={22} withName className="text-sm text-muted" />
      </div>

      <div className="w-12 h-12 rounded-2xl bg-brand-soft text-brand flex items-center justify-center mb-5">
        <Icon name="shield" size={24} />
      </div>
      <h1 className="text-3xl font-semibold tracking-tight">{c.title}</h1>
      <p className="text-subtle text-sm mt-2">{c.updated} {updated}</p>
      <p className="text-muted text-base leading-relaxed mt-6">{c.intro}</p>

      <div className="mt-10 flex flex-col gap-9">
        {c.sections.map(s => (
          <section key={s.title}>
            <h2 className="text-lg font-semibold tracking-tight mb-3">{s.title}</h2>
            <div className="flex flex-col gap-3">
              {s.body.map((p, i) => (
                <p key={i} className="text-[15px] leading-7 text-fg/85">
                  {p.includes(CONTACT_EMAIL)
                    ? <>{p.replace(CONTACT_EMAIL, '')}<a href={`mailto:${CONTACT_EMAIL}`} className="text-brand hover:underline underline-offset-4">{CONTACT_EMAIL}</a></>
                    : p}
                </p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  )
}
