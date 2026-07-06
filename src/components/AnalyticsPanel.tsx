/** Dialogue & gender analytics view. */
import { useMemo } from 'react'
import { useScriptStore } from '../stores/scriptStore'
import { characterStats, genderBreakdown } from '../engine/analysis'
import type { CharacterProfile } from '../types'

const GENDERS: CharacterProfile['gender'][] = ['female', 'male', 'nonbinary', 'unspecified']
const GENDER_COLORS: Record<CharacterProfile['gender'], string> = {
  female: '#a78bfa',
  male: '#60a5fa',
  nonbinary: '#4ade80',
  unspecified: '#cbd5e1',
}

export function AnalyticsPanel() {
  const script = useScriptStore((s) => s.script)
  const setCharacterGender = useScriptStore((s) => s.setCharacterGender)

  const stats = useMemo(
    () => characterStats(script.elements, script.characters),
    [script.elements, script.characters],
  )
  const byGender = useMemo(() => genderBreakdown(stats), [stats])
  const totalWords = stats.reduce((a, s) => a + s.words, 0) || 1

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-lg font-semibold mb-1 text-gray-800 dark:text-gray-100">
        Dialogue Analytics
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Who speaks, how much, and in how many scenes. Assign genders to see your balance.
      </p>

      <div className="mb-8">
        <h2 className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-2">
          Words spoken by gender
        </h2>
        <div className="flex h-6 w-full overflow-hidden rounded">
          {GENDERS.map((g) =>
            byGender.words[g] > 0 ? (
              <div
                key={g}
                title={`${g}: ${byGender.words[g]} words`}
                style={{
                  width: `${(byGender.words[g] / totalWords) * 100}%`,
                  background: GENDER_COLORS[g],
                }}
              />
            ) : null,
          )}
        </div>
        <div className="mt-2 flex flex-wrap gap-4 text-xs text-gray-500">
          {GENDERS.map((g) => (
            <span key={g} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: GENDER_COLORS[g] }} />
              {g}: {byGender.words[g]} words · {byGender.speeches[g]} speeches ·{' '}
              {byGender.characters[g]} characters
            </span>
          ))}
        </div>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 dark:border-slate-700 text-left text-xs uppercase tracking-wide text-gray-500">
            <th className="py-2">Character</th>
            <th>Gender</th>
            <th className="text-right">Speeches</th>
            <th className="text-right">Words</th>
            <th className="text-right">Scenes</th>
            <th className="text-right">Share</th>
          </tr>
        </thead>
        <tbody>
          {stats.map((s) => (
            <tr key={s.name} className="border-b border-gray-100 dark:border-slate-800">
              <td className="py-2 font-screenplay font-bold text-gray-800 dark:text-gray-100">
                {s.name}
              </td>
              <td>
                <select
                  className="rounded border border-gray-200 dark:border-slate-700 bg-transparent px-1 py-0.5 text-xs"
                  value={s.gender}
                  onChange={(e) =>
                    setCharacterGender(s.name, e.target.value as CharacterProfile['gender'])
                  }
                >
                  {GENDERS.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </td>
              <td className="text-right">{s.speeches}</td>
              <td className="text-right">{s.words}</td>
              <td className="text-right">{s.scenes}</td>
              <td className="text-right text-gray-500">
                {((s.words / totalWords) * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
          {stats.length === 0 && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-gray-400">
                No dialogue yet — write some lines and come back.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
