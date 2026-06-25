import { useState } from 'react'
import type { DriverState, PitEvent, ResultRow, StintRow } from '../../api/types'
import type { PitLoss } from '../../data/pitTimes'
import { Strategy } from './Strategy'
import { PitSimulator } from './PitSimulator'

interface Props {
  stints: StintRow[]
  pitLog: PitEvent[]
  results: ResultRow[]
  currentLap: number | null
  finished: boolean
  drivers: DriverState[]
  pitLoss: PitLoss
  circuit: string
}

type Sub = 'strategy' | 'pit'

/** Strategy section with two sub-tabs: the tyre/stint overview and the live Pit Simulator. */
export function StrategySection(props: Props) {
  const [sub, setSub] = useState<Sub>('strategy')

  return (
    <div className="strat-section">
      <div className="seg strat-subtabs">
        <button className={sub === 'strategy' ? 'active' : ''} onClick={() => setSub('strategy')}>
          Strategy
        </button>
        <button className={sub === 'pit' ? 'active' : ''} onClick={() => setSub('pit')}>
          Pit Simulator
        </button>
      </div>

      {sub === 'strategy' ? (
        <Strategy
          stints={props.stints}
          pitLog={props.pitLog}
          results={props.results}
          currentLap={props.currentLap}
          finished={props.finished}
        />
      ) : (
        <PitSimulator
          drivers={props.drivers}
          stints={props.stints}
          pitLoss={props.pitLoss}
          circuit={props.circuit}
        />
      )}
    </div>
  )
}
