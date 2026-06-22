import type { RaceState } from '../api/types'

// A slim footer carrying just the at-a-glance weather. Race-control messages
// are no longer pinned here — they flash up as auto-dismissing popovers (see
// NoticeStack) and the full log lives in the Race Control tab.
export function Ticker({ race }: { race: RaceState | undefined }) {
  const w = race?.weather
  if (!w) return null
  return (
    <div className="panel ticker">
      {w && (
        <span className="weather">
          {w.track_temperature != null && (
            <span>
              Track <b>{w.track_temperature.toFixed(1)}°</b>
            </span>
          )}
          {w.air_temperature != null && (
            <span>
              Air <b>{w.air_temperature.toFixed(1)}°</b>
            </span>
          )}
          {w.humidity != null && (
            <span>
              Hum <b>{w.humidity.toFixed(0)}%</b>
            </span>
          )}
          {w.wind_speed != null && (
            <span>
              Wind <b>{w.wind_speed.toFixed(1)}m/s</b>
            </span>
          )}
          <span>
            Rain <b>{w.rainfall ? 'YES' : 'NO'}</b>
          </span>
        </span>
      )}
    </div>
  )
}
