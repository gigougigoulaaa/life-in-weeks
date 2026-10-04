'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import dynamic from 'next/dynamic'
import { useI18n } from '@/lib/i18n'

const MapContainer = dynamic(() => import('react-leaflet').then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import('react-leaflet').then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import('react-leaflet').then(m => m.Marker), { ssr: false })
const Popup = dynamic(() => import('react-leaflet').then(m => m.Popup), { ssr: false })

export default function MapPage() {
  const { t } = useI18n()
  const [user, setUser] = useState<any>(null)
  const [weeks, setWeeks] = useState<any[]>([])
  const [isClient, setIsClient] = useState(false)

  useEffect(() => {
    setIsClient(true)
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) { window.location.href = '/login'; return }
      setUser(data.user)
      const { data: weeksData } = await supabase
        .from('weeks')
        .select('*')
        .eq('user_id', data.user.id)
        .not('location', 'is', null)
      setWeeks(weeksData || [])
    })
  }, [])

  if (!isClient) return null

  return (
    <div className="min-h-screen bg-black text-white pb-20">
      <div className="p-6 pb-2">
        <h1 className="text-3xl font-bold mb-2">{t('map.title')}</h1>
        <p className="text-zinc-400 text-sm mb-4">
          {t('map.count', { n: weeks.length })}
        </p>
      </div>

      {weeks.length === 0 ? (
        <div className="text-center mt-20 px-6">
          <p className="text-4xl mb-4">🗺️</p>
          <p className="text-zinc-400 mb-2">{t('map.empty')}</p>
          <p className="text-zinc-600 text-sm">{t('map.emptyHint')}</p>
        </div>
      ) : (
        <div style={{ height: 'calc(100vh - 180px)' }}>
          <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
          <MapContainer
            center={[weeks[0].location.lat, weeks[0].location.lng]}
            zoom={3}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='© OpenStreetMap'
            />
            {weeks.map(week => (
              <Marker
                key={week.id}
                position={[week.location.lat, week.location.lng]}
              >
                <Popup>
                  <div className="text-black">
                    <p className="font-bold">{week.title || t('common.weekOfYear', { n: week.week_number, year: week.year })}</p>
                    <p className="text-sm text-gray-600">{week.location.name}</p>
                    {week.content && <p className="text-sm mt-1">{week.content.slice(0, 100)}...</p>}
                    {week.media_urls?.[0] && (
                      <img src={week.media_urls[0]} alt="" className="w-full h-24 object-cover rounded mt-2" />
                    )}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}
    </div>
  )
}