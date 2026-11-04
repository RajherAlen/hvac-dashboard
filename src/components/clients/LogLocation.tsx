import { Link } from 'react-router-dom';
import { useClientDirectory } from '../../hooks/useClients';

/**
 * Lokacija unosa: ako je unos vezan na objekt, ime klijenta je link na klijenta,
 * inače se prikazuje spremljeni tekst lokacije (stari unosi, "Ured / ostalo").
 */
export function LogLocation({ log, className }: { log: { location: string; site_id?: string | null }; className?: string }) {
  const { siteIndex } = useClientDirectory();
  const hit = log.site_id ? siteIndex.get(log.site_id) : undefined;
  if (!hit) return <span className={className}>{log.location}</span>;
  const addr = [hit.site.address, hit.site.city].filter(Boolean).join(', ');
  return (
    <span className={className}>
      <Link to={`/klijenti/${hit.client.id}`} className="font-medium text-slate-800 hover:text-blue-700 hover:underline">{hit.client.name}</Link>
      {', '}{addr}
    </span>
  );
}
