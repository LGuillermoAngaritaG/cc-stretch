// What a reader faces in one reply, in words, using the plugin's own parser:
//   skim  every stretch closed: the reply as it first appears
//   full  every stretch open: everything the model wrote
//   read  the stretches the reader actually opened, and nothing else
import { parse } from '../hooks/parse.ts'
import type { Segment } from '../hooks/parse.ts'

/** The reply's text with the stretches whose short form is in `opened` open (all of them for 'all'). */
export function render(reply: string, opened: ReadonlySet<string> | 'all'): string {
  const write = (parts: Segment[]): string =>
    parts
      .map(part => {
        if (typeof part === 'string') return part
        if (part.long === undefined || !part.isClosed) return part.short
        const isOpen = opened === 'all' || opened.has(part.short.trim())
        return isOpen ? write(part.long) : part.short
      })
      .join('')
  return write(parse(reply))
}

/** Words a person reads: whitespace-separated tokens holding a letter or a digit. */
export function words(text: string): number {
  return text.split(/\s+/).filter(token => /[\p{L}\p{N}]/u.test(token)).length
}

export type Measure = { skim: number; full: number; read?: number }

export function measure(reply: string, opened?: ReadonlySet<string>): Measure {
  const skim = words(render(reply, new Set()))
  const full = words(render(reply, 'all'))
  return opened === undefined ? { skim, full } : { skim, full, read: words(render(reply, opened)) }
}

/** The reader's opened stretches from a note such as `Stretchtext: ... opened "a", "b". They did not open "c".` */
export function openedFrom(note: string): Set<string> {
  if (/opened no stretch/.test(note)) return new Set()
  const part = /opened (.*?)(?:\. They did not open|\.$)/s.exec(note)?.[1] ?? ''
  return new Set([...part.matchAll(/"([^"]*)"/g)].map(m => (m[1] ?? '').trim()))
}
