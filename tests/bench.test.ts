import { describe, expect, test } from 'claude-code/testing'

import { measure, openedFrom, render, words } from '../bench/measure.ts'

const REPLY = 'The build {{fails|fails on {{a stale cache|a cache keyed only by the lockfile}}}}. Fix `{{x|y}}` first.'

describe('benchmark measures', () => {
  test('skim closes every stretch, full opens every one, read opens only what the reader opened', async () => {
    expect(render(REPLY, new Set())).toBe('The build fails. Fix `{{x|y}}` first.')
    expect(render(REPLY, 'all')).toBe('The build fails on a cache keyed only by the lockfile. Fix `{{x|y}}` first.')
    expect(render(REPLY, new Set(['fails']))).toBe('The build fails on a stale cache. Fix `{{x|y}}` first.')
    expect(measure(REPLY, new Set(['fails']))).toEqual({ skim: 6, full: 14, read: 10 })
  })

  test('counts words that hold a letter or a digit, not markup or punctuation', async () => {
    expect(words('A *b* -- `c` 42 ---')).toBe(4)
  })

  test('reads the opened stretches back from a reading note', async () => {
    expect([...openedFrom('Stretchtext: since your last reply the reader opened "a b", "c". They did not open "d".')]).toEqual(['a b', 'c'])
    expect(openedFrom('Stretchtext: the reader opened no stretch of your last reply.').size).toBe(0)
  })
})
