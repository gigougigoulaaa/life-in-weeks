// ATTENTION : modèle à faire relire par un juriste avant toute mise en ligne publique.
'use client'
// Mentions légales — lisibles sans être connecté.
// Le texte est écrit ici directement (français, sinon anglais) plutôt que dans les traductions,
// car un texte juridique doit être relu langue par langue.
import { useI18n } from '@/lib/i18n'
import Icon from '../components/Icon'
import Logo from '../components/Logo'
import { btn } from '../components/ui'
import { CONTACT_EMAIL } from '@/lib/appInfo'

// Date de la dernière mise à jour du texte
const UPDATED_AT = new Date(2026, 9, 6)

type Section = { title: string, body: string[] }
type Content = { title: string, intro: string, updated: string, sections: Section[] }

const FR: Content = {
  title: 'Mentions légales',
  intro: "Informations légales relatives à l'application Life in Weeks, conformément à la loi pour la confiance dans l'économie numérique (LCEN).",
  updated: 'Dernière mise à jour :',
  sections: [
    { title: 'Éditeur', body: [
      "L'application Life in Weeks est éditée par le propriétaire de l'application, personne physique agissant à titre non professionnel.",
      `Contact : ${CONTACT_EMAIL}`,
    ] },
    { title: 'Directeur de la publication', body: [
      "Le propriétaire de l'application.",
    ] },
    { title: 'Hébergement', body: [
      "Application : Vercel Inc., États-Unis (vercel.com).",
      "Base de données et fichiers : Supabase (supabase.com).",
    ] },
    { title: 'Propriété intellectuelle', body: [
      "Le nom, le logo, le design et le code de l'application sont protégés. Toute reproduction sans autorisation est interdite.",
      "Les contenus publiés par les utilisateurs (textes, photos, vidéos) restent la propriété de leurs auteurs.",
    ] },
    { title: 'Données personnelles', body: [
      "Le traitement de tes données est expliqué dans la politique de confidentialité, accessible depuis les Paramètres. Tu disposes d'un droit d'accès, de rectification, d'effacement et de portabilité (export depuis les Paramètres).",
      "Tu peux aussi introduire une réclamation auprès de la CNIL (cnil.fr).",
    ] },
    { title: 'Cookies et stockage local', body: [
      "L'application n'utilise ni publicité ni suivi publicitaire. Elle conserve uniquement dans ton navigateur ce qui est nécessaire à son fonctionnement : ta session de connexion et tes préférences (par exemple la langue).",
    ] },
    { title: 'Responsabilité', body: [
      "L'éditeur s'efforce de fournir des informations et un service fiables, sans garantie d'absence d'erreur ou d'interruption. Les contenus publiés par les utilisateurs relèvent de leur responsabilité ; tu peux signaler un contenu depuis l'application.",
    ] },
    { title: 'Droit applicable', body: [
      "Les présentes mentions sont soumises au droit français.",
    ] },
    { title: 'Contact', body: [
      `Pour toute question : ${CONTACT_EMAIL}`,
    ] },
  ],
}

const EN: Content = {
  title: 'Legal notice',
  intro: 'Legal information about the Life in Weeks application.',
  updated: 'Last updated:',
  sections: [
    { title: 'Publisher', body: [
      'The Life in Weeks application is published by the owner of the application, an individual acting on a non-professional basis.',
      `Contact: ${CONTACT_EMAIL}`,
    ] },
    { title: 'Publication director', body: [
      'The owner of the application.',
    ] },
    { title: 'Hosting', body: [
      'Application: Vercel Inc., United States (vercel.com).',
      'Database and files: Supabase (supabase.com).',
    ] },
    { title: 'Intellectual property', body: [
      'The name, logo, design and code of the application are protected. Any reproduction without permission is forbidden.',
      'Content published by users (text, photos, videos) remains the property of its authors.',
    ] },
    { title: 'Personal data', body: [
      'How your data is handled is explained in the privacy policy, available from Settings. You have the right to access, correct, erase and port your data (export from Settings).',
      'You may also lodge a complaint with your data protection authority.',
    ] },
    { title: 'Cookies and local storage', body: [
      'The application uses no advertising or ad tracking. It only keeps in your browser what it needs to work: your sign-in session and your preferences (for example the language).',
    ] },
    { title: 'Liability', body: [
      'The publisher strives to provide reliable information and service, without guaranteeing the absence of errors or interruptions. Content published by users is their own responsibility; you can report content from the app.',
    ] },
    { title: 'Governing law', body: [
      'These notices are governed by French law.',
    ] },
    { title: 'Contact', body: [
      `For any question: ${CONTACT_EMAIL}`,
    ] },
  ],
}

export default function LegalPage() {
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
        <Icon name="info" size={24} />
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
