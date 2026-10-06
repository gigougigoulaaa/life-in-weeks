// ATTENTION : modèle à faire relire par un juriste avant toute mise en ligne publique.
'use client'
// Conditions d'utilisation — lisibles sans être connecté.
// Le texte est écrit ici directement (français, sinon anglais) plutôt que dans les traductions,
// car un texte juridique doit être relu langue par langue.
import { useI18n } from '@/lib/i18n'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { btn } from '../components/ui'
import { CONTACT_EMAIL, DELETION_GRACE_DAYS } from '@/lib/appInfo'

// Date de la dernière mise à jour du texte
const UPDATED_AT = new Date(2026, 9, 6)

type Section = { title: string, body: string[] }
type Content = { title: string, intro: string, updated: string, sections: Section[] }

const FR: Content = {
  title: "Conditions d'utilisation",
  intro: "En utilisant Life in Weeks, tu acceptes les règles ci-dessous. Elles sont écrites simplement : l'idée est que ton journal reste à toi, et que l'espace partagé reste agréable pour tout le monde.",
  updated: 'Dernière mise à jour :',
  sections: [
    { title: 'Le service', body: [
      "Life in Weeks est un journal personnel en ligne : tu y notes tes semaines, avec des textes, des photos, des vidéos et des lieux, et tu peux choisir d'en partager certaines avec d'autres personnes.",
      "Le service est proposé par le propriétaire de l'application (l'« éditeur »). Il peut évoluer, être amélioré ou interrompu temporairement pour maintenance.",
    ] },
    { title: 'Ton compte', body: [
      "Tu dois fournir une adresse e-mail valide et choisir un mot de passe que tu gardes pour toi. Tu es responsable de ce qui se passe depuis ton compte.",
      "Tu dois avoir au moins 15 ans, ou l'accord d'un parent ou d'un représentant légal.",
      "Tu peux modifier ton e-mail, ton mot de passe et tes paramètres de confidentialité à tout moment depuis les Paramètres.",
    ] },
    { title: 'Ton contenu', body: [
      "Tes souvenirs, photos, vidéos et messages t'appartiennent. Tu nous autorises seulement à les stocker et à les afficher selon tes réglages (privé par défaut), afin de faire fonctionner le service.",
      "Tu t'engages à ne publier que des contenus dont tu as le droit de te servir et qui respectent les droits des autres personnes (image, vie privée, droit d'auteur).",
    ] },
    { title: 'Règles de bonne conduite', body: [
      "Sont interdits : le harcèlement, les insultes, la haine, les menaces, les contenus illégaux, violents ou choquants, le spam, l'usurpation d'identité et toute tentative de contourner la sécurité du service.",
      "Tu peux bloquer une personne ou signaler un contenu depuis son profil. L'éditeur peut retirer un contenu ou suspendre un compte qui ne respecte pas ces règles.",
    ] },
    { title: 'Supprimer ton compte', body: [
      `Tu peux supprimer ton compte depuis Paramètres → « Supprimer mon compte ». Ton compte est alors désactivé et invisible pour les autres. Tu as ${DELETION_GRACE_DAYS} jours pour le récupérer en te reconnectant ; passé ce délai, tes données sont effacées définitivement.`,
      "Tu peux aussi exporter tes données à tout moment depuis les Paramètres.",
    ] },
    { title: 'Disponibilité et responsabilité', body: [
      "Nous faisons de notre mieux pour que le service soit disponible et sûr, mais nous ne pouvons pas garantir qu'il fonctionnera sans interruption ni erreur. Pense à conserver une copie de ce qui compte pour toi (la fonction d'export est là pour ça).",
      "Dans les limites permises par la loi, l'éditeur n'est pas responsable des dommages indirects liés à l'utilisation du service ou à une indisponibilité.",
    ] },
    { title: 'Modifications', body: [
      "Ces conditions peuvent évoluer. En cas de changement important, tu en seras informé(e) dans l'application. Continuer à utiliser le service après la mise à jour vaut acceptation.",
    ] },
    { title: 'Droit applicable', body: [
      "Ces conditions sont soumises au droit français. En cas de litige, nous chercherons d'abord une solution amiable avant toute action devant les tribunaux compétents.",
    ] },
    { title: 'Contact', body: [
      `Pour toute question sur ces conditions : ${CONTACT_EMAIL}`,
    ] },
  ],
}

const EN: Content = {
  title: 'Terms of Use',
  intro: 'By using Life in Weeks you agree to the rules below. They are written simply: your journal stays yours, and the shared space stays pleasant for everyone.',
  updated: 'Last updated:',
  sections: [
    { title: 'The service', body: [
      'Life in Weeks is an online personal journal: you write down your weeks with text, photos, videos and places, and you can choose to share some of them with other people.',
      'The service is provided by the owner of the application (the "publisher"). It may change, be improved, or be paused for maintenance.',
    ] },
    { title: 'Your account', body: [
      'You must provide a valid email address and choose a password that you keep to yourself. You are responsible for what happens from your account.',
      'You must be at least 15 years old, or have the consent of a parent or legal guardian.',
      'You can change your email, password and privacy settings at any time from Settings.',
    ] },
    { title: 'Your content', body: [
      'Your memories, photos, videos and messages belong to you. You only allow us to store and display them according to your settings (private by default) so the service can work.',
      'You agree to publish only content you are allowed to use and that respects the rights of others (image, privacy, copyright).',
    ] },
    { title: 'Code of conduct', body: [
      'Not allowed: harassment, insults, hate, threats, illegal, violent or shocking content, spam, impersonation, and any attempt to bypass the security of the service.',
      'You can block a person or report content from their profile. The publisher may remove content or suspend an account that breaks these rules.',
    ] },
    { title: 'Deleting your account', body: [
      `You can delete your account from Settings → "Delete my account". Your account is then deactivated and invisible to others. You have ${DELETION_GRACE_DAYS} days to recover it by signing in again; after that, your data is permanently erased.`,
      'You can also export your data at any time from Settings.',
    ] },
    { title: 'Availability and liability', body: [
      'We do our best to keep the service available and safe, but we cannot guarantee it will run without interruption or error. Keep a copy of what matters to you (the export feature is there for that).',
      'To the extent permitted by law, the publisher is not liable for indirect damages related to the use of the service or to downtime.',
    ] },
    { title: 'Changes', body: [
      'These terms may change. For any significant change, you will be informed in the app. Continuing to use the service after an update means you accept it.',
    ] },
    { title: 'Governing law', body: [
      'These terms are governed by French law. In case of a dispute, we will first look for an amicable solution before any action in the competent courts.',
    ] },
    { title: 'Contact', body: [
      `For any question about these terms: ${CONTACT_EMAIL}`,
    ] },
  ],
}

export default function TermsPage() {
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
        <Icon name="doc" size={24} />
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
