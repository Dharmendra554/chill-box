import { useState, type InputHTMLAttributes } from 'react'
import { boatName, boatsAt } from '../data/boats'
import { HARBOUR_IDS, HARBOURS } from '../data/harbours'
import { useT } from '../i18n/useT'
import { cx } from '../lib/ui'
import type { RegistrationError } from '../store/useDockStore'
import { useDockStore } from '../store/useDockStore'
import { AnchorIcon, BoatIcon } from '../icons/marine'

const ERROR_KEY = {
  boatName: 'errBoatName',
  owner: 'errOwner',
  mobile: 'errMobile',
  mobileTaken: 'errMobileTaken',
} as const

/**
 * First run, and the only place the harbour is chosen.
 *
 * A skipper works out of one harbour, so the society picker belongs here —
 * asked once, then remembered — rather than sitting in the chrome of every
 * screen offering a choice nobody makes twice.
 *
 * There is no password anywhere in the skipper's product: the boat lives in
 * this device's storage and the admin decides whether it may book. A shared
 * secret would be painted on a hull within a week, and a login screen is
 * exactly the wall that keeps this crowd off the app.
 */
export function RegisterScreen() {
  const t = useT()
  const lang = useDockStore((s) => s.lang)
  const harbourId = useDockStore((s) => s.harbourId)
  const allBoats = useDockStore((s) => s.boats)
  const setHarbour = useDockStore((s) => s.setHarbour)
  const register = useDockStore((s) => s.register)
  const signInAs = useDockStore((s) => s.signInAs)

  const [form, setForm] = useState({ boatName: '', owner: '', mobile: '' })
  const [error, setError] = useState<RegistrationError | null>(null)

  const boats = boatsAt(allBoats, harbourId)
  const update = (key: keyof typeof form) => (value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }))
    setError(null)
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="card flex flex-col gap-2 p-4">
        <h2 className="flex items-center gap-2 text-2xl">
          <AnchorIcon size={28} />
          {t('harbourChoose')}
        </h2>
        <ul className="grid grid-cols-1 gap-2">
          {HARBOUR_IDS.map((id) => {
            const picked = id === harbourId
            return (
              <li key={id}>
                <button
                  type="button"
                  className={cx(
                    'btn btn-block flex-col items-start gap-0.5 text-left',
                    picked && 'btn-sea',
                  )}
                  aria-pressed={picked}
                  onClick={() => setHarbour(id)}
                >
                  <span className="text-lg">
                    {lang === 'te' ? HARBOURS[id].nameTe : HARBOURS[id].nameEn}
                  </span>
                  <span className="w-full truncate text-xs font-bold opacity-80">
                    {lang === 'te' ? HARBOURS[id].unionTe : HARBOURS[id].unionEn}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </section>

      <section className="card flex flex-col gap-3 p-4">
        <h2 className="text-2xl">{t('regTitle')}</h2>
        <p className="font-bold text-ink-2">{t('regIntro')}</p>

        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault()
            const result = register(form)
            if (!result.ok) setError(result.error)
          }}
        >
          <Field
            label={t('regBoatName')}
            value={form.boatName}
            autoComplete="off"
            onChange={update('boatName')}
          />
          <Field
            label={t('regOwner')}
            value={form.owner}
            autoComplete="name"
            onChange={update('owner')}
          />
          <Field
            label={t('regMobile')}
            value={form.mobile}
            inputMode="numeric"
            autoComplete="tel"
            maxLength={10}
            onChange={update('mobile')}
          />

          {error ? (
            <p
              className="border-3 border-rule bg-full px-3 py-2 font-extrabold text-full-ink"
              role="alert"
            >
              {t(ERROR_KEY[error])}
            </p>
          ) : null}

          <button type="submit" className="btn btn-lg btn-primary btn-block">
            {t('regSubmit')}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xl">{t('regExisting')}</h3>
        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {boats.map((boat) => (
            <li key={boat.id}>
              <button
                type="button"
                className="btn btn-block flex-col gap-0.5 text-base"
                onClick={() => signInAs(boat.id)}
              >
                <BoatIcon size={20} />
                <span className="w-full truncate">{boatName(boat, lang)}</span>
                <span className="tabular text-xs font-bold">#{boat.id}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string
  value: string
  onChange: (value: string) => void
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-extrabold uppercase tracking-wide">{label}</span>
      <input
        className="field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    </label>
  )
}
