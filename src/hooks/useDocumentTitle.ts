import { useEffect } from 'react';

const APP_NAME = 'HVAC Admin';

/** Postavlja naslov taba: "<naslov> · HVAC Admin". Bez naslova prikazuje samo naziv aplikacije. */
export function useDocumentTitle(title: string | null | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_NAME}` : APP_NAME;
  }, [title]);
}
