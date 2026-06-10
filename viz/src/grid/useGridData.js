import { useCallback, useEffect, useRef, useState } from 'react';
// Seed copies bundled at build time — used until the remote fetch succeeds,
// and as a fallback if it never does (e.g. branch not yet merged to main).
import seedSites from '../../../data/grid/sites.json';
import seedLinks from '../../../data/grid/links.json';

const BASE =
  import.meta.env.VITE_GITHUB_RAW_BASE ||
  'https://raw.githubusercontent.com/seanker10/apparatus/main/data';

const REFRESH_MS = 120_000;

export default function useGridData() {
  const [sites, setSites] = useState(seedSites);
  const [links, setLinks] = useState(seedLinks);
  const [live, setLive] = useState(false);
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const ts = Date.now();
      const [sRes, lRes] = await Promise.all([
        fetch(`${BASE}/grid/sites.json?t=${ts}`),
        fetch(`${BASE}/grid/links.json?t=${ts}`),
      ]);
      if (!sRes.ok || !lRes.ok) return; // keep seed data
      const [s, l] = await Promise.all([sRes.json(), lRes.json()]);
      if (Array.isArray(s) && s.length > 0) {
        setSites(s);
        setLinks(Array.isArray(l) ? l : []);
        setLive(true);
      }
    } catch {
      // network error — seed data remains
    }
  }, []);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchAll]);

  return { sites, links, live };
}
