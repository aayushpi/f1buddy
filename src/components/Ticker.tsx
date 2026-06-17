import type { RaceState } from '../api/types'

export function Ticker({ race }: { race: RaceState | undefined }) {
  if (!race) return null
  const w = race.weather
  return (
    <div className="panel ticker">
      <span className="tag">Race Control</span>
      <span className="msg">{race.lastMessage ?? 'No messages yet.'}</span>
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
