import { useCallback, useEffect, useRef, useState } from 'react';
import seedFund from '../../../data/fund/fund.json';
import seedMarks from '../../../data/fund/marks.json';
import seedNav from '../../../data/fund/nav_history.json';
import seedTrades from '../../../data/fund/trades.json';

const BASE =
  import.meta.env.VITE_GITHUB_RAW_BASE ||
  'https://raw.githubusercontent.com/seanker10/apparatus/main/data';

const REFRESH_MS = 300_000; // 5 min — the book only moves once a day

export default function useFundData() {
  const [fund, setFund] = useState(seedFund);
  const [marks, setMarks] = useState(seedMarks);
  const [navHistory, setNavHistory] = useState(seedNav);
  const [trades, setTrades] = useState(seedTrades);
  const [live, setLive] = useState(false);
  const timerRef = useRef(null);

  const fetchAll = useCallback(async () => {
    try {
      const ts = Date.now();
      const [f, m, n, t] = await Promise.all([
        fetch(`${BASE}/fund/fund.json?t=${ts}`),
        fetch(`${BASE}/fund/marks.json?t=${ts}`),
        fetch(`${BASE}/fund/nav_history.json?t=${ts}`),
        fetch(`${BASE}/fund/trades.json?t=${ts}`),
      ]);
      if (!f.ok || !m.ok) return; // keep bundled seed
      const [fj, mj, nj, tj] = await Promise.all([
        f.json(),
        m.json(),
        n.ok ? n.json() : [],
        t.ok ? t.json() : [],
      ]);
      setFund(fj);
      setMarks(mj);
      setNavHistory(Array.isArray(nj) ? nj : []);
      setTrades(Array.isArray(tj) ? tj : []);
      setLive(true);
    } catch {
      // offline / not yet published — bundled seed stands
    }
  }, []);

  useEffect(() => {
    fetchAll();
    timerRef.current = setInterval(fetchAll, REFRESH_MS);
    return () => clearInterval(timerRef.current);
  }, [fetchAll]);

  return { fund, marks, navHistory, trades, live, refetch: fetchAll };
}
