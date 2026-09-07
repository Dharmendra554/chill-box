import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'
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
  // A shared harbour issues the hull number, so with no link there is no
  // registration to show — better to say so than to hand out a number the
  // society has never seen.
  offline: 'syncOffline',
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

  const [form, setForm] = useState({ boatName: '', owner: '', mobile: '' })
  const [error, setError] = useState<RegistrationError | null>(null)
  const [claiming, setClaiming] = useState<string | null>(null)
  // The hull number comes from the database now, which takes a round trip.
  // Without this, a second tap registers the same person twice and burns a
  // hull number that can never be reused.
  const [submitting, setSubmitting] = useState(false)

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
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting) return
            setSubmitting(true)
            try {
              // Awaited: with a shared harbour the database issues the hull
              // number, so the registration is not real until it answers.
              const result = await register(form)
              if (!result.ok) setError(result.error)
            } finally {
              setSubmitting(false)
            }
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

          <button
            type="submit"
            className="btn btn-lg btn-primary btn-block"
            disabled={submitting}
          >
            {t(submitting ? 'saving' : 'regSubmit')}
          </button>
        </form>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-xl">{t('regExisting')}</h3>
        {claiming ? (
          <ClaimBoat
            boatId={claiming}
            label={boatName(boats.find((b) => b.id === claiming)!, lang)}
            onClose={() => setClaiming(null)}
          />
        ) : null}

        <ul className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {boats.map((boat) => (
            <li key={boat.id}>
              <button
                type="button"
                className="btn btn-block flex-col gap-0.5 text-base"
                onClick={() => setClaiming(boat.id)}
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
}: Readonly<
  {
    label: string
    value: string
    onChange: (value: string) => void
  } & Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'>
>) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-extrabold uppercase">{label}</span>
      <input
        className="field"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        {...rest}
      />
    </label>
  )
}

/**
 * Confirms the person tapping a boat actually owns it, using the last four
 * digits of the number the society registered. See `signInAs` for why four
 * digits is the right amount of friction here.
 */
function ClaimBoat({
  boatId,
  label,
  onClose,
}: Readonly<{
  boatId: string
  label: string
  onClose: () => void
}>) {
  const t = useT()
  const signInAs = useDockStore((s) => s.signInAs)
  const [digits, setDigits] = useState('')
  const [wrong, setWrong] = useState(false)
  const [checking, setChecking] = useState(false)
  const box = useRef<HTMLInputElement>(null)

  // Bring the form to the skipper. It renders ABOVE the roster grid, and the
  // roster is twenty-one 70 px buttons — so tapping boat #18 opened a form
  // roughly six hundred pixels off the top of the screen and the viewport
  // did not move. As far as he could see, the button did nothing. Every
  // rehearsal tapped #01, which is at the top.
  useEffect(() => {
    box.current?.scrollIntoView({ block: 'center' })
    box.current?.focus()
  }, [])

  return (
    <form
      className="card flex flex-col gap-2 border-sea p-3"
      // AWAITED. `signInAs` is async, so `!signInAs(...)` was `!Promise` —
      // always false — and the "that does not match" panel below could never
      // render. One transposed digit at 4 a.m. produced a button that did
      // nothing at all, with no reason, on the only path an already-
      // registered skipper ever takes. Every rehearsal typed the right
      // digits, which is why seven audit rounds walked past it.
      onSubmit={async (event) => {
        event.preventDefault()
        if (checking) return
        setChecking(true)
        try {
          if (!(await signInAs(boatId, digits))) setWrong(true)
        } finally {
          setChecking(false)
        }
      }}
    >
      <h4 className="text-lg">{t('claimTitle', label)}</h4>
      <p className="text-sm font-bold text-ink-2">{t('claimBody')}</p>
      <input
        ref={box}
        className="field tabular"
        inputMode="numeric"
        autoComplete="off"
        maxLength={4}
        value={digits}
        aria-label={t('claimTitle', label)}
        onChange={(event) => {
          setDigits(event.target.value.replace(/\D/g, ''))
          setWrong(false)
        }}
      />
      {wrong ? (
        <p className="border-3 border-rule bg-full px-3 py-2 font-extrabold text-full-ink" role="alert">
          {t('claimWrong')}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="submit"
          className="btn btn-primary"
          disabled={digits.length < 4 || checking}
        >
          {t('claimGo')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          {t('cancel')}
        </button>
      </div>
    </form>
  )
}
