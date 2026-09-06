/**
 * Small file-export helpers. Everything is generated in the browser: there
 * is no server to render a report, and a fishing society should not have to
 * send its books to one to read them.
 */

function save(filename: string, mime: string, body: BlobPart[]): void {
  const url = URL.createObjectURL(new Blob(body, { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  // A timer, not requestAnimationFrame: rAF never fires in a hidden tab,
  // which would leak the object URL for the life of the page.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/**
 * CSV that Excel opens correctly.
 *
 * The UTF-8 byte-order mark is the whole trick: without it Excel on Windows
 * reads the file as the system codepage and every Telugu name turns to
 * mojibake. We ship CSV rather than a real .xlsx because a spreadsheet
 * writer is ~200 kB of JavaScript to produce a file Excel already opens
 * natively, and this app is downloaded over a 2G tether.
 */
export function saveCsv(filename: string, rows: Array<Array<string | number>>): void {
  const body = rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell)
          return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
        })
        .join(','),
    )
    .join('\r\n')
  save(filename, 'text/csv;charset=utf-8', ['﻿', body])
}

export interface Contact {
  name: string
  number: string
}

/**
 * A vCard of the emergency numbers, so a skipper saves them once and still
 * has them when the phone has no signal and no app. Distress numbers that
 * live only inside an app are the wrong place for them to live.
 */
export function saveContacts(filename: string, contacts: Contact[]): void {
  const body = contacts
    .map((c) =>
      [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:;${c.name};;;`,
        `FN:${c.name}`,
        `TEL;TYPE=VOICE:${c.number.replace(/\s/g, '')}`,
        'END:VCARD',
      ].join('\r\n'),
    )
    .join('\r\n')
  save(filename, 'text/vcard;charset=utf-8', [body])
}
