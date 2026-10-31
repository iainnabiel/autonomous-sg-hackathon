import { Fragment } from 'react'
import { dataSource } from '../api/client'
import { CoverageChart, type CoverageSeries } from '../components/charts/CoverageChart'
import { DemoTag, Page, PageHeader, Panel, PanelHeader } from '../components/layout/Page'

// The real evaluation artifacts come from SG-03 via `/metrics`. Until that endpoint exists, this page shows
// the layout the artifacts will fill, populated with clearly labelled demonstration numbers in fixture mode
// and an explicit "not evaluated" state against a live API.

const DEMO_SERIES: CoverageSeries[] = [
  { key: 'orbit', label: 'Orbit queue (tier × TCA)', color: 'var(--color-signal)', points: [[0, 0], [0.1, 0.5], [0.2, 0.83], [0.3, 1], [0.5, 1], [1, 1]] },
  { key: 'risk', label: 'Risk only', color: 'var(--color-violet)', points: [[0, 0], [0.1, 0.33], [0.2, 0.5], [0.3, 0.67], [0.5, 0.83], [1, 1]] },
  { key: 'distance', label: 'Distance first', color: 'var(--color-ink-2)', points: [[0, 0], [0.1, 0.17], [0.2, 0.5], [0.3, 0.67], [0.5, 0.83], [1, 1]] },
  { key: 'tca', label: 'TCA first', color: 'var(--color-ink-3)', points: [[0, 0], [0.1, 0.17], [0.2, 0.33], [0.3, 0.5], [0.5, 0.67], [1, 1]] },
]

export function Evaluation() {
  const live = dataSource === 'api'
  return (
    <Page wide>
      <PageHeader
        eyebrow="Evaluation"
        title={<>Three separate claims, each with its denominator</>}
        lede="How many critical endings the forecast catches beyond the persistence rule and at what false-alarm cost, how the thresholds classify, and whether the queue surfaces imminent critical encounters earlier than simpler rankings. Reported on a fixed held-out cohort."
        aside={live ? 'source: /metrics' : 'layout preview'}
      />

      {live ? (
        <Panel>
          <div className="px-6 py-16 text-center">
            <p className="text-sm font-medium text-ink">Not evaluated</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-3">No evaluation artifacts have been published to this backend yet. Results appear here once SG-03 serves them through /metrics.</p>
          </div>
        </Panel>
      ) : (
        <>
          <div className="mb-6 rounded-md border border-elevated/30 bg-elevated/[0.06] px-4 py-3 text-sm text-elevated/90">
            Every number on this page is a placeholder to show the layout. None of it is a measured result. Real artifacts replace these when the evaluation pipeline (SG-03) is wired in.
          </div>

          <div className="grid gap-6 xl:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <Panel>
              <PanelHeader title="Prioritisation benefit" note="coverage of imminent critical encounters vs proportion of queue reviewed · same cohort for all rankings" action={<DemoTag />} />
              <CoverageChart series={DEMO_SERIES} />
              <p className="border-t border-line px-5 py-3 text-[11px] leading-relaxed text-ink-3">Offline prioritisation result on a fixed cohort. Not a measurement of time saved or collisions avoided.</p>
            </Panel>

            <div className="flex flex-col gap-6">
              <Panel>
                <PanelHeader title="Operational classification" note="validation cohort" action={<DemoTag />} />
                <div className="px-5 py-4">
                  <ConfusionMatrix />
                </div>
              </Panel>
              <Panel>
                <PanelHeader title="Model comparison" note="validation, encounter-grouped split" action={<DemoTag />} />
                <table className="w-full font-mono text-[12px]">
                  <thead>
                    <tr className="eyebrow border-b border-line">
                      <th className="px-5 py-2 text-left font-medium">model</th>
                      <th className="px-3 py-2 text-right font-medium">critical recall</th>
                      <th className="px-3 py-2 text-right font-medium">false critical</th>
                      <th className="px-5 py-2 text-right font-medium">n</th>
                    </tr>
                  </thead>
                  <tbody className="text-ink-2">
                    {[
                      ['persistence rule', '—', '—', '—'],
                      ['upgrade, base features', '—', '—', '—'],
                      ['upgrade + max_risk_estimate', '—', '—', '—'],
                    ].map(([m, a, b, n]) => (
                      <tr key={m} className="border-b border-line last:border-0">
                        <td className="px-5 py-2 text-ink">{m}</td>
                        <td className="tabular px-3 py-2 text-right">{a}</td>
                        <td className="tabular px-3 py-2 text-right">{b}</td>
                        <td className="tabular px-5 py-2 text-right">{n}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="border-t border-line px-5 py-3 text-[11px] text-ink-3">Awaiting SG-05/SG-06 artifacts. Cells stay blank rather than showing invented numbers.</p>
              </Panel>
            </div>
          </div>
        </>
      )}
    </Page>
  )
}

/** Layout-only confusion matrix: structure is real, values are not. */
function ConfusionMatrix() {
  const labels = ['critical', 'elevated', 'safe']
  return (
    <div>
      <div className="grid grid-cols-[72px_repeat(3,1fr)] gap-1 font-mono text-[11px]">
        <div />
        {labels.map((l) => (
          <div key={l} className="eyebrow pb-1 text-center text-[10px]">
            pred. {l}
          </div>
        ))}
        {labels.map((row) => (
          <Fragment key={row}>
            <div className="eyebrow flex items-center text-[10px]">
              true {row}
            </div>
            {labels.map((col) => (
              <div key={`${row}-${col}`} className={`grid h-12 place-items-center rounded-sm border ${row === col ? 'border-signal/30 bg-signal/[0.07] text-ink' : 'border-line text-ink-3'}`}>
                —
              </div>
            ))}
          </Fragment>
        ))}
      </div>
      <p className="mt-3 text-[11px] text-ink-3">Raw and normalised matrices, false-negative counts and sample sizes will be shown here. Undefined metrics are marked, not zeroed.</p>
    </div>
  )
}
